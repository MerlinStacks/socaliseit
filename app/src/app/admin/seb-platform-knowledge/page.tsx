'use client';

import { useEffect, useState } from 'react';
import { Save, Sparkles } from 'lucide-react';

type Item = { id: string; platform: string; title: string; content: string; sourceUrl?: string | null; confidence: number; isActive: boolean; updatedAt: string };

const PLATFORMS = ['INSTAGRAM', 'FACEBOOK', 'META', 'TIKTOK', 'YOUTUBE', 'PINTEREST', 'GOOGLE_BUSINESS', 'LINKEDIN', 'BLUESKY', 'THREADS', 'MANUAL'];

export default function SebPlatformKnowledgePage() {
    const [items, setItems] = useState<Item[]>([]);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ platform: 'INSTAGRAM', title: '', content: '', sourceUrl: '', confidence: 0.8 });

    const load = async () => {
        const res = await fetch('/api/admin/seb/platform-knowledge');
        const data = await res.json();
        setItems(data.items || []);
    };

    useEffect(() => { load(); }, []);

    const save = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/admin/seb/platform-knowledge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            if (res.ok) {
                setForm({ platform: 'INSTAGRAM', title: '', content: '', sourceUrl: '', confidence: 0.8 });
                await load();
            }
        } finally {
            setSaving(false);
        }
    };

    const toggle = async (item: Item) => {
        await fetch(`/api/admin/seb/platform-knowledge/${item.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive: !item.isActive }),
        });
        await load();
    };

    return (
        <div>
            <div className="mb-8">
                <h1 className="flex items-center gap-2 text-2xl font-bold text-white"><Sparkles className="h-6 w-6 text-purple-400" /> Seb Platform Knowledge</h1>
                <p className="mt-1 text-gray-400">Keep Seb current with platform changes, best practices, sources, and confidence.</p>
            </div>

            <div className="mb-8 rounded-xl border border-gray-800 bg-gray-900 p-6">
                <div className="grid gap-4 md:grid-cols-3">
                    <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white">
                        {PLATFORMS.map((platform) => <option key={platform} value={platform}>{platform}</option>)}
                    </select>
                    <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Update title" className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white" />
                    <input type="number" min="0" max="1" step="0.05" value={form.confidence} onChange={(e) => setForm({ ...form, confidence: Number(e.target.value) })} className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white" />
                </div>
                <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="What should Seb know about this platform?" rows={5} className="mt-4 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white" />
                <input value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} placeholder="Source URL" className="mt-4 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white" />
                <button onClick={save} disabled={saving} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60">
                    <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Knowledge'}
                </button>
            </div>

            <div className="space-y-3">
                {items.map((item) => (
                    <div key={item.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-sm text-purple-300">{item.platform} · confidence {Math.round(item.confidence * 100)}%</p>
                                <h2 className="mt-1 font-semibold text-white">{item.title}</h2>
                                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-400">{item.content}</p>
                                {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 block text-sm text-purple-300">{item.sourceUrl}</a>}
                            </div>
                            <button onClick={() => toggle(item)} className="rounded-lg bg-gray-800 px-3 py-2 text-sm text-white">{item.isActive ? 'Deactivate' : 'Activate'}</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
