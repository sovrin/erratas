// Every rule about what erratas accepts and shows lives here, shared by the pages and the server.
// The owner's sign-in and the projects are nexitas'.
import { z } from 'zod'

export type IssueLevel = 'error' | 'warning' | 'info'
export const ISSUE_LEVELS: readonly IssueLevel[] = ['error', 'warning', 'info']

/** `unresolved` is the resting state: an issue exists because something broke. */
export type IssueStatus = 'unresolved' | 'resolved' | 'ignored'
export const ISSUE_STATUSES: readonly IssueStatus[] = ['unresolved', 'resolved', 'ignored']

/** One line of source context around a frame. `err` marks the failing line. */
export interface SourceLine {
  n: number
  text: string
  err?: boolean
}

/** A stack frame as the pages show it. Not the SDK's wire frame (filename, function, lineno,
 *  colno), which differs per platform: ingest flattens it into `func` and `loc` once. */
export interface DisplayFrame {
  func?: string
  loc?: string
  code?: SourceLine[]
}

/** One runtime inside a project: the frontend, the API, a worker. Each has its own DSN, so a
 *  key leaked from a browser bundle is not the key the backend reports with. */
export interface Stack {
  id: string
  projectId: string
  name: string
  /** Free text; only decides which install snippet is shown. */
  platform: string
  /** Public by design: it ships in browser bundles. It routes reports and grants nothing else. */
  publicKey: string
}

/** A distinct bug, not a report of one: events collapse into it by fingerprint. `count` is a
 *  running total; the environment and release are the most recent ones seen. */
export interface Issue {
  id: string
  stackId: string
  stackName: string
  title: string
  culprit: string
  level: IssueLevel
  status: IssueStatus
  count: number
  /** Milliseconds. */
  firstSeen: number
  lastSeen: number
  environment: string
  release: string
}

/** An issue on its own page, with its stack trace. */
export interface IssueDetail extends Issue {
  frames: DisplayFrame[]
}

/** A new stack. Nothing about it changes later: a new key would stop every app reporting with
 *  the old one, and a move would carry its issues along. */
export const newStackSchema = z
  .object({
    name: z.string().trim().min(1, 'Give the stack a name.').max(60),
    platform: z.string().trim().max(40),
  })
  .strict()

export const issueStatusSchema = z
  .object({ status: z.enum(ISSUE_STATUSES as [IssueStatus, ...IssueStatus[]]) })
  .strict()
