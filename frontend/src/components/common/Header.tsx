import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface HeaderProps {
  title: string
  showBack?: boolean
  left?: React.ReactNode
  right?: React.ReactNode
}

export default function Header({ title, showBack = false, left, right }: HeaderProps) {
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
      <div className="flex items-center justify-between h-14 px-4 max-w-lg mx-auto">
        <div className="flex items-center gap-1">
          {left}
          {showBack && (
            <button onClick={() => navigate(-1)} className="p-1 -ml-1">
              <ArrowLeft size={22} />
            </button>
          )}
          <h1 className="text-lg font-bold text-gray-900">{title}</h1>
        </div>
        {right && <div>{right}</div>}
      </div>
    </header>
  )
}
