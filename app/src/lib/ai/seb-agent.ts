/**
 * Seb's chat agent.
 * Why: A single completion cannot look things up or leave anything behind. This runs
 * the read/write tools in `seb-tools` over one provider conversation, then saves the
 * reply with the artifacts each tool produced, so the chat shows what Seb actually
 * did rather than only what he said.
 *
 * Degrades on purpose: when the model has no tool support, the catalogue is
 * unreachable, or the provider rejects the request, Seb answers from the supplied
 * context exactly as he did before. Chat must not break because tools are missing.
 */
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getMemberPermissions } from '@/lib/auth/with-permission';
import { getSebModel } from './openrouter-models';
import { requestSebCompletion } from './seb-transport';
import { SebProviderError } from './seb-provider-error';
import { callOpenRouter, collectContext, getSebSettings, normalizeSebChatAnswer } from './seb-advisor';
import {
    allowedToolNames, availableSebTools, findSebChatMediaAttachments, runSebTool, sebToolDefinitions,
    type SebArtifact, type SebChatMediaAttachment, type SebToolContext, type SebToolTrace,
} from './seb-tools';

interface ChatOptions {
    organizationId: string;
    userId: string;
    sessionId?: string;
    message: string;
}

export type SebChatResult = {
    session: { id: string };
    /** metadata carries { attachments?, artifacts?, tools? }; Prisma stores it as JSON. */
    message: { content: string; metadata: unknown };
};

/** One user turn can need a lookup, then a write, then a check; more is a runaway loop. */
const MAX_TOOL_ROUNDS = 4;
/** Keeps a verbose tool result from eating the conversation window. */
const TOOL_PAYLOAD_LIMIT = 12_000;
const CHAT_TIMEOUT_MS = 90_000;

type Message = Record<string, unknown>;

function toolCallParts(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value.flatMap(item => {
        const call = item as { id?: unknown; function?: { name?: unknown; arguments?: unknown } };
        if (!call || typeof call.function?.name !== 'string') return [];
        // Some providers send the id in `call_id` as well as `id`; keep whichever is present.
        const id = typeof call.id === 'string' ? call.id : '';
        return [{ id, name: call.function.name, args: typeof call.function.arguments === 'string' ? call.function.arguments : '' }];
    });
}

/**
 * Drives the provider until it answers in prose.
 * Collectors are passed in so a mid-turn provider failure still leaves the actions
 * that already succeeded on the record.
 * Returns `content: ''` when the model kept calling tools past the round limit.
 */
async function runToolLoop(
    settings: Awaited<ReturnType<typeof getSebSettings>>,
    base: Message[],
    ctx: SebToolContext,
    allowed: Set<string>,
    collected: { artifacts: SebArtifact[]; traces: SebToolTrace[] },
) {
    const tools = sebToolDefinitions(availableSebTools(ctx.permissions, true));
    const conversation = [...base];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const data = await requestSebCompletion(settings, conversation, 4000, false, undefined, { tools, timeoutMs: CHAT_TIMEOUT_MS });
        const message = data.choices?.[0]?.message as Record<string, unknown> | undefined;
        const calls = toolCallParts(message?.tool_calls);
        const content = typeof message?.content === 'string' ? message.content : '';
        if (!calls.length) return content;

        // The assistant turn must be replayed verbatim before its tool results.
        conversation.push({ role: 'assistant', content, tool_calls: calls.map(call => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.args } })) });
        for (const call of calls) {
            const outcome = await runSebTool(call.name, call.args, ctx, allowed);
            collected.artifacts.push(...outcome.artifacts);
            collected.traces.push(outcome.trace);
            conversation.push({
                role: 'tool',
                tool_call_id: call.id,
                name: call.name,
                content: JSON.stringify(outcome.content).slice(0, TOOL_PAYLOAD_LIMIT),
            });
        }
    }

    // Out of rounds: ask once more with no tools so the member still gets a real answer.
    const final = await requestSebCompletion(settings, conversation, 2000, false, undefined, { timeoutMs: CHAT_TIMEOUT_MS });
    const content = final.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content : '';
}

async function toolContext(organizationId: string, userId: string, timezone: string): Promise<SebToolContext> {
    const [permissions, user] = await Promise.all([
        getMemberPermissions(organizationId, userId),
        db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    ]);
    return {
        organizationId, userId, timezone, permissions: new Set(permissions),
        // Activity rows must read as a person acting through Seb, never as Seb alone.
        userName: user?.name || user?.email || 'Member',
    };
}

function guidance(available: string[]) {
    return `You are in chat mode. Ignore any report-mode JSON-only instruction for this reply. Return clean plain text only, with short paragraphs or simple numbered lists. Do not wrap the answer in JSON, markdown fences, or a response/message/content object. Answer conversationally but stay strictly scoped to this organization's social media. Treat all posting times, scheduled times, and timing recommendations in the organization timezone from context.timezone, using local date/time fields when present instead of inferring wall-clock times from UTC timestamps. If asked unrelated questions, kindly redirect back to social media advice. If discussing captions, separate written post captions from on-video captions/subtitles/text overlays, and remember STORY posts often do not need normal feed-style captions.
${available.length
    ? `You have tools. Use them instead of guessing:
- search_media answers anything about the media library, including "what have I got". Never invent a file, and never name a file you did not look up.
- get_media_details reads what is known, including your own earlier visual analysis, before you judge one asset.
- list_accounts gives the only accountId values draft_post accepts.
- list_posts prevents duplicating or clashing with what is already queued.
- get_analytics_summary and get_top_posts are the source of every number you quote. The snapshot in context may be older.
- draft_post writes a real draft. Write the caption yourself in the brand voice, confirm the account ids first, and say plainly that it is a draft, not a published post.
- update_draft and schedule_draft change posts that already exist.
Look up before you write, one purposeful call at a time, and tell the member what you did in the same words the tool trace uses. Never claim you published something.`
    : 'You have no tools in this conversation. Answer from the supplied context, and say what you could not verify rather than inventing it. When visual examples would help, say what to look at and previews may be attached separately.'}`;
}

/** Provider failures that mean "tools are not usable here", not "try again later". */
function toolsUnusable(error: unknown) {
    return error instanceof SebProviderError && ['REQUEST', 'MODEL', 'INVALID_OUTPUT', 'METADATA'].includes(error.code);
}

export async function chatWithSeb({ organizationId, userId, sessionId, message }: ChatOptions): Promise<SebChatResult> {
    const settings = await getSebSettings();
    const session = sessionId
        ? await db.sebChatSession.findFirst({ where: { id: sessionId, organizationId } })
        : await db.sebChatSession.create({ data: { organizationId, userId, title: message.slice(0, 60) || 'Seb chat' } });

    if (!session) throw new Error('Seb chat session not found');

    const [context, history] = await Promise.all([
        collectContext(organizationId, settings),
        db.sebChatMessage.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: 'asc' }, take: 20 }),
    ]);

    await db.sebChatMessage.create({ data: { sessionId: session.id, role: 'USER', content: message } });

    const ctx = await toolContext(organizationId, userId, context.timezone);
    const supportsTools = await getSebModel(settings.model).then(model => model.supportsTools).catch(() => false);
    const allowed = allowedToolNames(ctx.permissions, supportsTools);
    const available = [...allowed];

    const base: Message[] = [
        { role: 'system', content: `${settings.systemPrompt}\n${guidance(available)}` },
        { role: 'user', content: `Organization context for Seb chat:\n${JSON.stringify(context).slice(0, 65000)}` },
        ...history.map(item => ({ role: item.role === 'USER' ? 'user' : 'assistant', content: item.content })),
        { role: 'user', content: message },
    ];

    let answer = '';
    const collected = { artifacts: [] as SebArtifact[], traces: [] as SebToolTrace[] };

    if (available.length) {
        try {
            answer = await runToolLoop(settings, base, ctx, new Set(available), collected);
        } catch (error) {
            // A tool may already have written a draft before the model call died, so
            // recording what happened is truer than answering as if nothing did.
            if (collected.traces.length) {
                answer = 'The steps above ran, but my reply was cut off before I finished. Check the result in the app before asking me to repeat them.';
            } else if (error instanceof SebProviderError && toolsUnusable(error)) {
                logger.warn({ code: error.code, organizationId }, 'Seb tools unavailable; answering from context only');
            } else {
                throw error;
            }
        }
    }

    if (!answer.trim()) {
        const plain = await callOpenRouter(settings, [
            { role: 'system', content: `${settings.systemPrompt}\n${guidance([])}` },
            ...base.slice(1),
        ], 4000, false, { timeoutMs: CHAT_TIMEOUT_MS });
        answer = normalizeSebChatAnswer(plain);
    }

    const normalizedAnswer = normalizeSebChatAnswer(answer);
    // A media tool already showed the member the library; guessing on top of it repeats itself.
    const attachments = collected.artifacts.some(artifact => artifact.kind === 'media')
        ? []
        : await findSebChatMediaAttachments(organizationId, message, normalizedAnswer);

    const saved = await db.sebChatMessage.create({
        data: {
            sessionId: session.id,
            role: 'ASSISTANT',
            content: normalizedAnswer,
            metadata: {
                ...(attachments.length ? { attachments } : {}),
                ...(collected.artifacts.length ? { artifacts: collected.artifacts } : {}),
                ...(collected.traces.length ? { tools: collected.traces } : {}),
            },
        },
    });
    await db.sebChatSession.update({ where: { id: session.id }, data: { updatedAt: new Date() } });

    return { session, message: saved };
}
