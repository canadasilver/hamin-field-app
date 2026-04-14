const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: '대기', className: 'bg-gray-100 text-gray-600' },
  assigned: { label: '배정됨', className: 'bg-blue-100 text-blue-700' },
  in_progress: { label: '진행중', className: 'bg-blue-500 text-white' },
  completed: { label: '완료', className: 'bg-green-500 text-white' },
  postponed: { label: '미루기', className: 'bg-orange-100 text-orange-700' },
}

interface StatusBadgeProps {
  status: string
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.pending
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${config.className}`}>
      {config.label}
    </span>
  )
}
