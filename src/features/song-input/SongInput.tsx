type SongInputProps = {
  value: string
  placeholder: string
  onChange: (value: string) => void
}

export function SongInput({ value, placeholder, onChange }: SongInputProps) {
  return (
    <div className="mt-4">
      <label htmlFor="song-list" className="text-sm font-medium">
        Song list
      </label>
      <textarea
        id="song-list"
        name="song-list"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-describedby="mode-guidance input-stats"
        className="mt-2 min-h-48 w-full resize-y rounded-2xl border border-line bg-field px-4 py-3 text-[15px] leading-7 text-text caret-accent outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-faint focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20 sm:min-h-52"
      />
    </div>
  )
}
