type PendingFile = {
  fileName: string
  kind: 'txt' | 'csv' | 'docx'
}

type FileUploadProps = {
  disabled: boolean
  fileName: string | null
  error: string | null
  note: string
  pending: PendingFile | null
  replacesTypedText: boolean
  onFile: (file: File) => void
  onConfirm: () => void
  onCancel: () => void
}

export function FileUpload({ disabled, fileName, error, note, pending, replacesTypedText, onFile, onConfirm, onCancel }: FileUploadProps) {
  return (
    <div className="mt-4 rounded-2xl border border-dashed border-line-strong/90 bg-field/60 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <FileIcon muted={disabled} />
          <div className="min-w-0">
            <p className="text-sm font-medium">{fileName ? fileName : 'Import a file'}</p>
            <p id="file-upload-note" className="mt-0.5 text-sm leading-5 text-muted">
              {note}
            </p>
          </div>
        </div>
        <label
          className={`relative inline-flex h-10 items-center justify-center rounded-full border border-line px-4 text-sm font-medium ${
            disabled ? 'cursor-not-allowed text-faint' : 'cursor-pointer text-text hover:border-accent/70'
          }`}
        >
          Choose file
          <input
            type="file"
            accept=".txt,.csv,.docx,text/plain,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            disabled={disabled}
            aria-describedby="file-upload-note"
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (file) {
                onFile(file)
              }
            }}
          />
        </label>
      </div>
      {pending ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-5 text-text">
            {replacesTypedText
              ? `Replace the current song list with ${pending.fileName}?`
              : `Use ${pending.fileName} for the review? The text you typed stays in the box.`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onConfirm}
              className="inline-flex h-9 items-center rounded-full bg-accent px-3 text-sm font-semibold text-accent-ink"
            >
              Replace list
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-9 items-center rounded-full border border-line px-3 text-sm text-muted hover:text-text"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm leading-5 text-spot">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function FileIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={`mt-0.5 shrink-0 ${muted ? 'text-faint' : 'text-accent'}`}
    >
      <path
        d="M6.2 2.5h5.1L15.5 6.7V16a1.5 1.5 0 0 1-1.5 1.5H6.2A1.5 1.5 0 0 1 4.7 16V4a1.5 1.5 0 0 1 1.5-1.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M11 2.8V6.4h3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}
