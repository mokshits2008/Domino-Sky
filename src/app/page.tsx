'use client';

import React, { useEffect } from 'react';
import { useSimulatorStore } from '@/lib/store';
import { TopBar } from '@/components/layout/TopBar';
import { DisruptionBuilder } from '@/components/simulator/DisruptionBuilder';
import { KpiGrid } from '@/components/simulator/KpiGrid';
import { GanttTimeline } from '@/components/simulator/GanttTimeline';
import { NetworkMap } from '@/components/simulator/NetworkMap';
import { FlightsTable } from '@/components/simulator/FlightsTable';
import { ConnectionsTable } from '@/components/simulator/ConnectionsTable';
import { CrewsTable } from '@/components/simulator/CrewsTable';
import { FlightDrawer } from '@/components/simulator/FlightDrawer';
import { DispatcherModal } from '@/components/dispatcher/DispatcherModal';
import { AssumptionsModal } from '@/components/modals/AssumptionsModal';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import {
  CalendarDays,
  MapPin,
  Plane,
  Users,
  UserCheck,
} from 'lucide-react';

export default function SimulatorPage() {
  const {
    activeTab,
    setActiveTab,
    loadFromQueryString,
  } = useSimulatorStore();

  // Load state from URL parameters on initial client mount
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search) {
      loadFromQueryString(window.location.search);
    }
  }, [loadFromQueryString]);

  const tabs = [
    { id: 'gantt' as const, label: 'Timeline Gantt', icon: CalendarDays },
    { id: 'map' as const, label: 'Network Map', icon: MapPin },
    { id: 'flights' as const, label: 'Flights (70)', icon: Plane },
    { id: 'connections' as const, label: 'Connections (21)', icon: Users },
    { id: 'crews' as const, label: 'Crews (16)', icon: UserCheck },
  ];

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-canvas">
      {/* 56px Top Bar */}
      <TopBar />

      {/* Main Grid: Left Rail (320px) | Center (minmax(0,1fr)) | Right Drawer (380px or 0) */}
        <main
          role="main"
          aria-label="Flight cascade simulator dashboard"
          className="flex-1 min-h-0 grid grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_auto] overflow-hidden"
        >
          {/* Left Rail: Disruption Builder */}
          <ErrorBoundary>
            <DisruptionBuilder />
          </ErrorBoundary>

          {/* Center Panel */}
            <section
              role="region"
              aria-label="Simulation results and visualization"
              className="flex flex-col min-h-0 min-w-0 p-4 space-y-3.5 overflow-hidden"
            >
              {/* Top 6 KPI Cards */}
                <div className="flex-shrink-0 min-w-0">
                  <ErrorBoundary>
                    <KpiGrid />
                  </ErrorBoundary>
                </div>

                {/* Tab Navigation Toolbar */}
                    <div
                      role="tablist"
                      aria-label="Simulator views"
                      className="flex-shrink-0 flex items-center justify-between border-b border-border pb-2 overflow-x-auto min-w-0"
                    >
                      <div className="flex items-center space-x-1 flex-nowrap">
                        {tabs.map((tab) => {
                          const Icon = tab.icon;
                          const isActive = activeTab === tab.id;
                          return (
                            <button
                              key={tab.id}
                              id={`tab-${tab.id}`}
                              role="tab"
                              aria-selected={isActive}
                              aria-controls={`tabpanel-${tab.id}`}
                              data-testid={`tab-${tab.id}`}
                              onClick={() => setActiveTab(tab.id)}
                              className={`flex items-center space-x-2 px-3 py-1.5 rounded-input text-xs font-medium transition-colors ${isActive
                                  ? 'bg-surface text-ink font-semibold shadow-card border border-border'
                                  : 'text-ink-muted hover:text-ink hover:bg-surface/50'
                                }`}
                            >
                              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>{tab.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Active Tab Content Area */}
                      <div
                        role="tabpanel"
                        id={`tabpanel-${activeTab}`}
                        aria-labelledby={`tab-${activeTab}`}
                        className="flex-1 min-h-0 min-w-0 overflow-hidden"
                      >
                        <ErrorBoundary>
                          {activeTab === 'gantt' && <GanttTimeline />}
                          {activeTab === 'map' && <NetworkMap />}
                          {activeTab === 'flights' && <FlightsTable />}
                          {activeTab === 'connections' && <ConnectionsTable />}
                          {activeTab === 'crews' && <CrewsTable />}
                        </ErrorBoundary>
                      </div>
                    </section>

                    {/* Right Collapsible Inspector Drawer */}
                    <ErrorBoundary>
                      <FlightDrawer />
                    </ErrorBoundary>
                  </main>

                  {/* Dialog Modals */}
                  <DispatcherModal />
                  <AssumptionsModal />
                </div>
                );
}
