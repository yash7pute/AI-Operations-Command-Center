export interface ApprovalRequest {
  id: string
  signal: Signal
  classification: Classification
  proposedAction: Action
  status: 'Pending' | 'Approved' | 'Rejected'
  reviewer?: string
  reviewedAt?: string
  rejectionReason?: string
}
