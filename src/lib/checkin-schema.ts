import { z } from 'zod'

const clientItemSchema = z.object({
  id: z.string(),
  client: z.string(),
  task: z.string(),
})

const blockerItemSchema = clientItemSchema.extend({
  issue: z.string(),
  pointPerson: z.string(),
})

export const checkInDraftSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    dateLabel: z.string().trim().min(1, 'Date / report label is required'),
    projects: z.string().trim().min(1, 'List every project in this report'),
    currentlyWorking: z.array(clientItemSchema),
    completed: z.array(clientItemSchema),
    pending: z.array(clientItemSchema),
    blocker: z.array(blockerItemSchema),
    helpFrom: z.array(clientItemSchema),
    eta: z.array(clientItemSchema),
    weekKey: z.string(),
  })
  .superRefine((values, context) => {
    const sections = [
      ['currentlyWorking', values.currentlyWorking],
      ['completed', values.completed],
      ['pending', values.pending],
      ['helpFrom', values.helpFrom],
      ['eta', values.eta],
    ] as const

    for (const [section, items] of sections) {
      const seen = new Set<string>()
      items.forEach((item, index) => {
        if (!item.client.trim() && !item.task.trim()) return
        if (!item.client.trim()) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Client / project is required',
            path: [section, index, 'client'],
          })
        }
        if (!item.task.trim()) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Details are required',
            path: [section, index, 'task'],
          })
        }
        const key = item.client.trim().toLowerCase()
        if (key && seen.has(key)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Consolidate this project into its existing field',
            path: [section, index, 'client'],
          })
        }
        seen.add(key)
      })
    }

    values.blocker.forEach((item, index) => {
      if (!item.client.trim() && !item.issue.trim() && !item.pointPerson.trim()) return
      if (!item.client.trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Client / project is required',
          path: ['blocker', index, 'client'],
        })
      }
      if (!item.issue.trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Describe the blocker',
          path: ['blocker', index, 'issue'],
        })
      }
      if (!item.pointPerson.trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Name the point person',
          path: ['blocker', index, 'pointPerson'],
        })
      }
    })
  })

export type CheckInDraftValues = z.infer<typeof checkInDraftSchema>
