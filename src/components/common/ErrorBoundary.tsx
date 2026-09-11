import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertOctagon, RotateCcw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled component error:', error, errorInfo)
    this.setState({ errorInfo })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-[#0c0d0e] flex items-center justify-center p-6 text-zinc-200 select-none">
          <div className="max-w-xl w-full bg-[#15171c] border border-rose-900/50 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertOctagon className="w-6 h-6 shrink-0" />
              <h2 className="text-base font-semibold">渲染异常保护 (Render Protected)</h2>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              检测到组件渲染异常，已拦截整页黑屏崩溃。请尝试刷新页面。
            </p>

            {this.state.error && (
              <div className="p-3 bg-[#0a0b0d] border border-zinc-800 rounded-lg text-xs font-mono text-rose-300 overflow-x-auto max-h-40">
                {this.state.error.toString()}
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                onClick={this.handleReload}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded-lg flex items-center gap-2 transition-colors shadow"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>刷新并重新加载</span>
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
