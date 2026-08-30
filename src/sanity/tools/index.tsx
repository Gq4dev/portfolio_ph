/**
 * Studio tool registration, shared by the embedded Studio (/admin) and the
 * standalone one — both configs import from here so the definition lives in
 * exactly one place.
 *
 * The icon is a local SVG on purpose: importing one from `@sanity/icons` made
 * Vite's dependency pre-bundle miss the export and blanked the whole Studio.
 * A cosmetic icon is not worth a runtime dependency that can break the shell.
 */
import EventUploader from './EventUploader'

function UploadEventIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
      <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
    </svg>
  )
}

export const eventUploaderTool = {
  name: 'event-uploader',
  title: 'Subir evento',
  icon: UploadEventIcon,
  component: EventUploader,
}
