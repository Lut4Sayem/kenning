import { useMatch } from 'react-router-dom'

/** Where a node opens: boards have their own screen. Every link to a node goes through this. */
export const nodePath = (id: string, type?: 'PAGE' | 'BOARD' | null) => (type === 'BOARD' ? `/b/${id}` : `/p/${id}`)

/** The page or board open on screen, if any. */
export function useOpenNodeId(): string | undefined {
  const page = useMatch('/p/:nodeId')
  const board = useMatch('/b/:nodeId')
  return (page ?? board)?.params.nodeId
}
