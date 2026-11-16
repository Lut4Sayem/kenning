import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createNode } from '../api/nodes'

/** Creates a page in a space (top level or under a parent), refreshes the tree and opens the new page. */
export function useCreatePage(spaceId: string) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [message, setMessage] = useState('')

  async function create(parentId: string | null, onCreated?: () => void) {
    setMessage('')
    try {
      const created = await createNode(spaceId, { parentId })
      onCreated?.()
      await qc.invalidateQueries({ queryKey: ['tree', spaceId] })
      navigate(`/p/${created.id}`, { state: { isNew: true } }) // QA-16: the page puts the caret in its title
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not create the page')
    }
  }
  return { create, message, setMessage }
}
