'use client';

import { useId } from 'react';
import { ChevronLeft, ChevronRight, Filter, MoreHorizontal, Plus, RefreshCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { useCalendarOrchestration } from '@/hooks/use-calendar-orchestration';
import { useComposeAccounts } from '@/hooks/use-compose-data';
import type { CalendarViewMode } from '@/hooks/use-calendar-navigation';
import { cn } from '@/lib/utils';
import {
    CalendarFilterGroup, PLATFORMS, POST_TYPES, POST_STATUSES,
    platformLabels, postTypeLabels, postStatusLabels,
} from './CalendarFilters';
import { CalendarSettingsPanel } from './CalendarSettingsPanel';
import { useCalendarDisclosure } from './useCalendarDisclosure';

type Calendar = ReturnType<typeof useCalendarOrchestration>;
export type CalendarToolbarProps = Pick<Calendar,
    'selectedPlatforms' | 'setSelectedPlatforms' | 'selectedPostTypes' | 'setSelectedPostTypes' |
    'selectedStatuses' | 'setSelectedStatuses' | 'syncing' | 'handleSync' | 'handleNewNote'> & {
        nav: Pick<Calendar['nav'], 'goToPrevious' | 'goToToday' | 'goToNext' | 'getHeaderText' | 'viewMode' | 'setViewMode'>;
        onCompose: (url: string) => void;
    };

const panelClass = 'absolute right-0 top-full z-50 mt-2 max-h-[min(65dvh,36rem)] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-primary)] shadow-xl';

/** Primary calendar controls, with secondary controls in non-modal disclosures. */
export function CalendarToolbar(props: CalendarToolbarProps) {
    const { nav, selectedPlatforms, setSelectedPlatforms, selectedPostTypes, setSelectedPostTypes,
        selectedStatuses, setSelectedStatuses, syncing, handleSync, handleNewNote, onCompose } = props;
    const filters = useCalendarDisclosure();
    const more = useCalendarDisclosure();
    const id = useId();
    const { accounts, isLoadingAccounts, accountsError } = useComposeAccounts();
    // Keep canonical ordering and show each connected platform only once.
    const availablePlatforms = PLATFORMS.filter(platform => accounts.some(account => account.platform === platform));
    const visibleSelectedPlatforms = availablePlatforms.filter(platform => selectedPlatforms.includes(platform));
    const categories = [
        { label: 'Platform', selected: visibleSelectedPlatforms, options: availablePlatforms, reset: () => setSelectedPlatforms([...PLATFORMS]) },
        { label: 'Type', selected: selectedPostTypes, options: POST_TYPES, reset: () => setSelectedPostTypes([...POST_TYPES]) },
        { label: 'Status', selected: selectedStatuses, options: POST_STATUSES, reset: () => setSelectedStatuses([...POST_STATUSES]) },
    ];
    const active = categories.filter(category => category.selected.length < category.options.length);
    const runAction = (action: () => void) => {
        more.setIsOpen(false);
        more.triggerRef.current?.focus();
        action();
    };

    return (
        <section aria-label="Calendar controls" className="relative border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-4 lg:px-8">
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" aria-label="Previous date range" data-testid="calendar-prev" onClick={nav.goToPrevious}>
                        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                    </Button>
                    <Button variant="secondary" onClick={nav.goToToday}>Today</Button>
                    <Button variant="ghost" size="icon" aria-label="Next date range" data-testid="calendar-next" onClick={nav.goToNext}>
                        <ChevronRight aria-hidden="true" className="h-4 w-4" />
                    </Button>
                </div>
                <h2 aria-live="polite" className="min-w-0 flex-1 text-sm font-medium text-[var(--text-secondary)]">{nav.getHeaderText()}</h2>
                <div className="flex max-w-full flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`${id}-view`}>Calendar view</label>
                    <select id={`${id}-view`} value={nav.viewMode} onChange={event => nav.setViewMode(event.target.value as CalendarViewMode)}
                        className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)]">
                        {(['day', 'week', 'month', 'timeline', 'grid'] as const).map(mode => (
                            <option key={mode} value={mode}>{mode[0].toUpperCase() + mode.slice(1)}</option>
                        ))}
                    </select>
                    <div className="lg:relative" ref={filters.panelRef}>
                        <Button variant="secondary" ref={filters.triggerRef} aria-expanded={filters.isOpen} aria-controls={`${id}-filters`}
                            onClick={() => { filters.setIsOpen(!filters.isOpen); more.setIsOpen(false); }}>
                            <Filter aria-hidden="true" className="h-4 w-4" /> Filters ({active.length})
                        </Button>
                        {filters.isOpen && (
                            <div id={`${id}-filters`} role="region" aria-label="Calendar filters" className={cn(panelClass, 'left-4 right-auto w-[36rem] max-w-[calc(100%-2rem)] lg:left-auto lg:right-0 lg:max-w-[calc(100vw-2rem)]')}>
                                <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                                    <div>
                                        <CalendarFilterGroup label="Platform" options={availablePlatforms} labels={platformLabels} selected={visibleSelectedPlatforms} onChange={setSelectedPlatforms} />
                                        {availablePlatforms.length === 0 && (
                                            <p className="text-xs text-[var(--text-secondary)]">
                                                {isLoadingAccounts ? 'Loading platforms…' : accountsError ? 'Unable to load connected platforms.' : 'No social accounts connected.'}
                                            </p>
                                        )}
                                    </div>
                                    <CalendarFilterGroup label="Type" options={POST_TYPES} labels={postTypeLabels} selected={selectedPostTypes} onChange={setSelectedPostTypes} />
                                    <CalendarFilterGroup label="Status" options={POST_STATUSES} labels={postStatusLabels} selected={selectedStatuses} onChange={setSelectedStatuses} />
                                </div>
                            </div>
                        )}
                    </div>
                    <CalendarSettingsPanel />
                    <div className="relative" ref={more.panelRef}>
                        <Button variant="secondary" ref={more.triggerRef} aria-label="More actions" aria-expanded={more.isOpen} aria-controls={`${id}-actions`}
                            onClick={() => { more.setIsOpen(!more.isOpen); filters.setIsOpen(false); }}>
                            <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
                        </Button>
                        {more.isOpen && (
                            <div id={`${id}-actions`} role="region" aria-label="More calendar actions" className={cn(panelClass, 'w-60 space-y-1')}>
                                <Button variant="ghost" className="w-full justify-start" onClick={() => runAction(() => handleNewNote())}>
                                    <Plus aria-hidden="true" className="h-4 w-4" /> New Note
                                </Button>
                                <Button variant="ghost" className="w-full justify-start" disabled={syncing} onClick={() => runAction(handleSync)}>
                                    <RefreshCcw aria-hidden="true" className={cn('h-4 w-4', syncing && 'animate-spin')} />
                                    {syncing ? 'Syncing external posts…' : 'Sync external posts'}
                                </Button>
                            </div>
                        )}
                    </div>
                    <Button onClick={() => onCompose(selectedPlatforms.length > 0 && selectedPlatforms.length < PLATFORMS.length
                        ? `/compose?platforms=${selectedPlatforms.join(',')}` : '/compose')}>
                        <Plus aria-hidden="true" className="h-4 w-4" /> New Post
                    </Button>
                </div>
            </div>
            {active.length > 0 && (
                <div aria-label="Active filters" className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    {active.map(category => (
                        <button type="button" key={category.label} aria-label={`Clear ${category.label.toLowerCase()} filter`}
                            onClick={category.reset} className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-1.5">
                            {category.label}: {category.selected.length === 0 ? 'None' : `${category.selected.length} of ${category.options.length}`}
                            <X aria-hidden="true" className="h-3 w-3" />
                        </button>
                    ))}
                    <button type="button" onClick={() => categories.forEach(category => category.reset())} className="rounded px-2 py-1.5 underline">Clear all</button>
                </div>
            )}
        </section>
    );
}
