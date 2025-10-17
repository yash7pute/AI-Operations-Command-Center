export type Action = {
  id: string
  signalId: string
  type: 'approve' | 'modify' | 'reject'
  timestamp: number
  status: 'pending' | 'completed' | 'failed'
  description?: string
  platform: 'Notion' | 'Trello' | 'Slack' | 'Drive' | 'Sheets'
  resourceLink?: string
}
