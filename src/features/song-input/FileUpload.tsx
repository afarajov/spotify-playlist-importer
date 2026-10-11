const supportedFileTypes = '.txt and .csv'

export function FileUpload() {
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-dashed border-line-strong/90 bg-field/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <FileIcon />
        <div>
          <p className="text-sm font-medium">Import a file</p>
          <p id="file-upload-note" className="mt-0.5 text-sm leading-5 text-muted">
            {supportedFileTypes} import will be available in a later stage.
          </p>
        </div>
      </div>
      <label className="relative inline-flex h-10 cursor-not-allowed items-center justify-center rounded-full border border-line px-4 text-sm font-medium text-faint">
        Choose file
        <input
          type="file"
          accept=".txt,.csv,text/plain,text/csv"
          disabled
          aria-describedby="file-upload-note"
          className="sr-only"
        />
      </label>
    </div>
  )
}

function FileIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="mt-0.5 shrink-0 text-faint"
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
