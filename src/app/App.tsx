import { AppFooter } from '../components/layout/AppFooter.tsx'
import { AppHeader } from '../components/layout/AppHeader.tsx'
import { HeroSection } from '../components/layout/HeroSection.tsx'
import { WorkflowIndicator } from '../components/workflow/WorkflowIndicator.tsx'
import { SongInputPanel } from '../features/song-input/SongInputPanel.tsx'
import { pageColumnClass } from './layout.ts'

export function App() {
  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      <main className={`${pageColumnClass} flex-1 pt-8 pb-12 sm:pt-10`}>
        <HeroSection />
        <WorkflowIndicator currentStage="add_songs" />
        <SongInputPanel />
      </main>
      <AppFooter />
    </div>
  )
}
