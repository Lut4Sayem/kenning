import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createNode } from '../api/nodes'
import { nodePath } from '../app/nodePath'

/** Creates a page or board in a space (top level or under a parent), refreshes the tree and opens it. */
export function useCreatePage(spaceId: string) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [message, setMessage] = useState('')

  async function create(parentId: string | null, onCreated?: () => void, type: 'PAGE' | 'BOARD' = 'PAGE') {
    setMessage('')
    try {
      const created = await createNode(spaceId, type === 'BOARD' ? { parentId, type } : { parentId })
      onCreated?.()
      await qc.invalidateQueries({ queryKey: ['tree', spaceId] })
      navigate(nodePath(created.id, type), { state: { isNew: true } }) // QA-16: the page puts the caret in its title
    } catch (e) {
      setMessage(e instanceof Error ? e.message : `Could not create the ${type === 'BOARD' ? 'board' : 'page'}`)
    }
  }
  return { create, message, setMessage }
}
