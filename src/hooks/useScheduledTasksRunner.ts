import { useEffect, useCallback } from 'react'
import type { Session } from '../types/opencode'
import { api } from '../services/api'
import {
  getScheduledTasks,
  updateScheduledTask,
  shouldRunTask,
  advanceTaskAfterRun,
  type ScheduledTask,
} from '../utils/scheduler'

export interface UseScheduledTasksRunnerParams {
  createNewSession: (params?: {
    title?: string
    agent?: string
    directory?: string
    model?: { id: string; providerID: string; variant?: string }
  }) => Promise<Session>
  onToast: (message: string, durationMs?: number) => void
}

export function useScheduledTasksRunner({ createNewSession, onToast }: UseScheduledTasksRunnerParams) {
  useEffect(() => {
    const runner = async () => {
      const tasks = getScheduledTasks()
      const now = Date.now()
      for (const task of tasks) {
        if (shouldRunTask(task, now)) {
          try {
            console.log(`[ScheduledTask] Running task "${task.title}"...`)
            const newSession = await createNewSession({
              title: task.title,
              directory: task.directory,
              agent: task.agent,
              model: task.model,
            })
            await api.sendPrompt(newSession.id, task.prompt, {
              agent: task.agent,
              model:
                task.model?.id && task.model?.providerID
                  ? { providerID: task.model.providerID, modelID: task.model.id }
                  : undefined,
            })
            const advanced = advanceTaskAfterRun(task, now)
            updateScheduledTask(task.id, {
              enabled: advanced.enabled,
              lastRun: advanced.lastRun,
              nextRun: advanced.nextRun,
              lastStatus: 'success',
              lastSessionId: newSession.id,
            })
            onToast(`计划任务 "${task.title}" 已自动触发执行`, 3000)
          } catch (err: any) {
            console.error(`[ScheduledTask] Failed to execute task "${task.title}":`, err)
            updateScheduledTask(task.id, {
              lastStatus: 'error',
              lastError: err?.message || 'Execution error',
            })
          }
        }
      }
    }

    const timer = setInterval(runner, 15000)
    return () => clearInterval(timer)
  }, [createNewSession, onToast])

  const handleRunScheduledTaskNow = useCallback(
    async (task: ScheduledTask) => {
      const newSession = await createNewSession({
        title: task.title,
        directory: task.directory,
        agent: task.agent,
        model: task.model,
      })
      await api.sendPrompt(newSession.id, task.prompt, {
        agent: task.agent,
        model:
          task.model?.id && task.model?.providerID
            ? { providerID: task.model.providerID, modelID: task.model.id }
            : undefined,
      })
      const advanced = advanceTaskAfterRun(task, Date.now())
      updateScheduledTask(task.id, {
        enabled: advanced.enabled,
        lastRun: advanced.lastRun,
        nextRun: advanced.nextRun,
        lastStatus: 'success',
        lastSessionId: newSession.id,
      })
      onToast(`已手动触发计划任务 "${task.title}"`, 3000)
    },
    [createNewSession, onToast]
  )

  return { handleRunScheduledTaskNow }
}
