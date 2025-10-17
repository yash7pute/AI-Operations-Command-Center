export interface Signal {
  id: string
  source: 'Gmail' | 'Slack' | 'Sheets'
  subject: string
  preview: string
  timestamp: string
  status: 'Processing' | 'Classified' | 'Action Taken' | 'Error'
  urgency: 'Critical' | 'High' | 'Medium' | 'Low'
}
