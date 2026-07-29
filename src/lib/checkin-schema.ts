import { z } from 'zod'

const completedItemSchema = z.object({
  id: z.string(),
  client: z.string(),
  task: z.string(),
})

export const checkInDraftSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    dateLabel: z.string().trim().min(1, 'Date / report label is required'),
    projects: z.string().trim().min(1, 'List every project touched since the last report'),
    currentlyWorking: z.object({
      client: z.string(),
      task: z.string(),
    }),
    completed: z.array(completedItemSchema),
    pending: z.string(),
    blocker: z.object({
      issue: z.string(),
      pointPerson: z.string(),
    }),
    helpFrom: z.string(),
    eta: z.string(),
    weekKey: z.string(),
  })
  .superRefine((values, context) => {
    const currentClient = values.currentlyWorking.client.trim()
    const currentTask = values.currentlyWorking.task.trim()

    if (currentClient && !currentTask) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Describe the active task, or clear the client for None',
        path: ['currentlyWorking', 'task'],
      })
    }

    if (currentTask && !currentClient) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Name the client, or clear the task for None',
        path: ['currentlyWorking', 'client'],
      })
    }

    if (currentClient && currentTask && !values.eta.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ETA is required when an active item is set',
        path: ['eta'],
      })
    }

    const issue = values.blocker.issue.trim()
    const pointPerson = values.blocker.pointPerson.trim()

    if (issue && !pointPerson) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Name the Point Person who needs to answer',
        path: ['blocker', 'pointPerson'],
      })
    }

    if (pointPerson && !issue) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Describe the specific blocker',
        path: ['blocker', 'issue'],
      })
    }

    const filledCompleted = values.completed.filter(
      (item) => item.client.trim() || item.task.trim(),
    )
    for (const [index, item] of values.completed.entries()) {
      if (!item.client.trim() && !item.task.trim()) continue
      if (!item.client.trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Client is required',
          path: ['completed', index, 'client'],
        })
      }
      if (!item.task.trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Deliverable is required',
          path: ['completed', index, 'task'],
        })
      }
    }

    if (filledCompleted.length === 0) {
      // Allow empty completed early in the week — not an error
    }
  })

export type CheckInDraftValues = z.infer<typeof checkInDraftSchema>
