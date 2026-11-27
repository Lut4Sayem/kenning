import { ScreenSkeleton } from '../ui/States'

/** The board screen (`/app/b/:id`). Loaded lazily: only board routes pull in the drawing code. */
export default function BoardView() {
  return <ScreenSkeleton />
}
