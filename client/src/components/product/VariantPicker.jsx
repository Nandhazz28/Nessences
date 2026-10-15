export function VariantPicker({
  p,
  color,
  size,
  onColor,
  onSize,
  onSizeGuide,
}) {
  const variants = p.variants.filter((v) => v.color.name === color);
  const sel = variants.find((v) => v.size === size);
  return (
    <>
      <fieldset className="mt-8">
        <legend className="eyebrow !text-ink font-semibold">
          Colour{" "}
          <span className="font-normal text-muted ml-2 normal-case tracking-normal">
            {color}
          </span>
        </legend>
        <div className="flex gap-3 mt-3">
          {p.colors.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => onColor(c.name)}
              aria-label={c.name}
              aria-pressed={c.name === color}
              className={`w-9 h-9 rounded-full border-2 ${c.name === color ? "border-ink" : "border-control"} p-0.5`}
            >
              <span
                className="block w-full h-full rounded-full"
                style={{ background: c.hex }}
              />
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-8">
        <div className="flex justify-between items-baseline">
          <legend className="eyebrow !text-ink font-semibold">Size</legend>
          {onSizeGuide && (
            <button
              type="button"
              className="text-small link-u"
              onClick={onSizeGuide}
            >
              Size guide
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {variants.map((v) => {
            const out = v.status === "out_of_stock";
            return (
              <button
                key={v.id}
                type="button"
                disabled={out}
                onClick={() => onSize(v.size)}
                aria-pressed={v.size === size}
                className={`min-w-14 h-12 px-3 border text-small transition-colors ${v.size === size ? "bg-ink text-paper border-ink" : "border-control hover:border-ink"} ${out ? "line-through text-muted bg-sand/60 hover:border-control" : ""}`}
              >
                {v.size}
                <span className="sr-only">{out ? " (out of stock)" : ""}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-small min-h-5" aria-live="polite">
          {!p.inStock ? (
            <span className="text-oxblood">
              This piece is currently out of stock.
            </span>
          ) : sel?.status === "low_stock" ? (
            <span className="text-oxblood">
              Only {sel.available} left in this size.
            </span>
          ) : sel ? (
            <span className="text-muted">In stock.</span>
          ) : (
            <span className="text-muted">
              Select a size to see availability.
            </span>
          )}
        </p>
      </fieldset>
    </>
  );
}
