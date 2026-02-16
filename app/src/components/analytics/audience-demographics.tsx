/**
 * Audience Demographics Component
 * Visualizes age/gender distribution, top countries, and top cities.
 *
 * Why: Instagram/Facebook APIs return audience breakdowns that get synced
 * into `platformMetrics` JSON but were never displayed.
 */

'use client';

import { Globe, Users, MapPin } from 'lucide-react';
import type { AudienceDemographicsData } from '@/app/(dashboard)/analytics/analytics-data';

interface AudienceDemographicsProps {
    data: AudienceDemographicsData;
}

/**
 * Three-panel demographic display: age/gender bars, top countries, top cities.
 */
export function AudienceDemographics({ data }: AudienceDemographicsProps) {
    const hasData = data.ageGender.length > 0 || data.topCountries.length > 0;

    if (!hasData) {
        return (
            <div className="card p-5">
                <div className="flex items-center gap-2 mb-1">
                    <Users className="h-4 w-4 text-[var(--accent-gold)]" />
                    <h3 className="font-semibold">Audience Demographics</h3>
                </div>
                <p className="text-sm text-[var(--text-muted)]">
                    Demographics data will appear after syncing Instagram or Facebook analytics.
                </p>
            </div>
        );
    }

    return (
        <div className="card p-5">
            <div className="flex items-center gap-2 mb-5">
                <Users className="h-4 w-4 text-[var(--accent-gold)]" />
                <h3 className="font-semibold">Audience Demographics</h3>
            </div>

            <div className="grid grid-cols-3 gap-6">
                {/* Age & Gender */}
                <div>
                    <h4 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">
                        Age & Gender
                    </h4>
                    <div className="space-y-2">
                        {data.ageGender.map(entry => {
                            const total = entry.male + entry.female + entry.other;
                            if (total <= 0) return null;
                            return (
                                <div key={entry.age} className="text-xs">
                                    <div className="flex justify-between mb-1">
                                        <span className="text-[var(--text-secondary)]">{entry.age}</span>
                                        <span className="text-[var(--text-muted)]">{total.toFixed(1)}%</span>
                                    </div>
                                    <div className="flex h-2 rounded-full overflow-hidden bg-[var(--bg-tertiary)]">
                                        {entry.male > 0 && (
                                            <div
                                                className="bg-blue-500 transition-all"
                                                style={{ width: `${(entry.male / total) * 100}%` }}
                                            />
                                        )}
                                        {entry.female > 0 && (
                                            <div
                                                className="bg-pink-500 transition-all"
                                                style={{ width: `${(entry.female / total) * 100}%` }}
                                            />
                                        )}
                                        {entry.other > 0 && (
                                            <div
                                                className="bg-gray-400 transition-all"
                                                style={{ width: `${(entry.other / total) * 100}%` }}
                                            />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        <div className="flex items-center gap-4 mt-3 text-xs text-[var(--text-muted)]">
                            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Male</span>
                            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-pink-500" /> Female</span>
                            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gray-400" /> Other</span>
                        </div>
                    </div>
                </div>

                {/* Top Countries */}
                <div>
                    <h4 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">
                        <Globe className="h-3 w-3 inline mr-1" />Top Countries
                    </h4>
                    <div className="space-y-2">
                        {data.topCountries.slice(0, 6).map(c => (
                            <div key={c.name} className="text-xs">
                                <div className="flex justify-between mb-1">
                                    <span className="text-[var(--text-secondary)]">{c.name}</span>
                                    <span className="text-[var(--text-muted)]">{c.percentage.toFixed(1)}%</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-[var(--bg-tertiary)]">
                                    <div
                                        className="h-full rounded-full bg-[var(--accent-gold)] transition-all"
                                        style={{ width: `${Math.min(c.percentage, 100)}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Top Cities */}
                <div>
                    <h4 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">
                        <MapPin className="h-3 w-3 inline mr-1" />Top Cities
                    </h4>
                    <div className="space-y-2">
                        {data.topCities.slice(0, 6).map(c => (
                            <div key={c.name} className="text-xs">
                                <div className="flex justify-between mb-1">
                                    <span className="text-[var(--text-secondary)]">{c.name}</span>
                                    <span className="text-[var(--text-muted)]">{c.percentage.toFixed(1)}%</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-[var(--bg-tertiary)]">
                                    <div
                                        className="h-full rounded-full bg-violet-500 transition-all"
                                        style={{ width: `${Math.min(c.percentage, 100)}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
