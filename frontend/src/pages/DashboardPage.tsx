import React from 'react'
import Layout from '../components/Layout'
import DemoMode from '../components/DemoMode'
import GuidedTour from '../components/GuidedTour'
import SignalFeed from '../components/SignalFeed'
import ActionLog from '../components/ActionLog'
import LiveMonitor from '../components/LiveMonitor'
import ApprovalQueue from '../components/ApprovalQueue'
import QuickApproval from '../components/QuickApproval'
import MetricsOverview from '../components/MetricsOverview'
import PerformanceCharts from '../components/PerformanceCharts'
import ClassificationAnalytics from '../components/ClassificationAnalytics'
import HealthStatus from '../components/HealthStatus'
import ErrorLog from '../components/ErrorLog'
import ManualActionTrigger from '../components/ManualActionTrigger'
import SignalReplay from '../components/SignalReplay'
import ConfigPanel from '../components/ConfigPanel'
import ActivityFeed from '../components/ActivityFeed'
import AlertBanner from '../components/AlertBanner'
import ToastNotification, { useToasts } from '../components/ToastNotification'

const Dashboard = () => {
  const { toasts, addToast } = useToasts()

  return (
    <Layout>
      <GuidedTour />
      <AlertBanner alerts={[]} />
      <ToastNotification toasts={toasts} />
      <DemoMode />

      <section className="mb-12">
        <SignalFeed />
      </section>

      <section className="mb-12 grid grid-cols-1 md:grid-cols-2 gap-6">
        <ActionLog />
        <LiveMonitor />
      </section>

      <section className="mb-12 grid grid-cols-1 md:grid-cols-2 gap-6">
        <ApprovalQueue />
        <QuickApproval />
      </section>

      <section className="mb-12">
        <MetricsOverview />
      </section>

      <section className="mb-12">
        <PerformanceCharts />
      </section>

      <section className="mb-12">
        <ClassificationAnalytics />
      </section>

      <section className="mb-12 grid grid-cols-1 md:grid-cols-2 gap-6">
        <HealthStatus />
        <ErrorLog />
      </section>

      <section className="mb-12 grid grid-cols-1 md:grid-cols-2 gap-6">
        <ManualActionTrigger />
        <SignalReplay />
      </section>

      <section className="mb-12">
        <ConfigPanel />
      </section>

      <section className="mb-12">
        <ActivityFeed />
      </section>
    </Layout>
  )
}

export default Dashboard
