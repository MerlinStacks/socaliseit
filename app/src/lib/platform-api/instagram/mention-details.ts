import { metaJson } from '../meta-fetch';
import { GRAPH_API_URL } from './constants';

/** Mention fields require IDs supplied by Meta webhooks; they are not list edges. */
export async function getInstagramMentionDetails(
    accessToken: string,
    accountId: string,
    id: string,
    isComment: boolean,
) {
    const field = isComment ? 'mentioned_comment' : 'mentioned_media';
    const selector = isComment ? 'comment_id' : 'media_id';
    // Mentioned comments expose text/time, but do not promise author information.
    const fields = isComment ? 'id,text,timestamp' : 'id,caption,username,media_url,timestamp';
    const query = new URLSearchParams({ fields: `${field}.${selector}(${id}){${fields}}` });
    const data = await metaJson(accessToken, `${GRAPH_API_URL}/${accountId}?${query}`);
    if (data.error) throw new Error(data.error.message || 'Instagram mention lookup failed');
    const item = data[field];
    if (!item || typeof item !== 'object') throw new Error('Instagram mention lookup returned no details');
    const createdAt = item.timestamp ? new Date(item.timestamp) : undefined;
    return {
        text: typeof (item.text ?? item.caption) === 'string' ? item.text ?? item.caption : undefined,
        authorUsername: typeof item.username === 'string' ? item.username : undefined,
        authorId: typeof item.username === 'string' ? item.username : undefined,
        mediaUrl: typeof item.media_url === 'string' ? item.media_url : undefined,
        createdAt: createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : undefined,
    };
}
