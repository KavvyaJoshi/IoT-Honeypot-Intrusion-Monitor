export function Card({ as: Tag = 'section', className = '', children, ...rest }) {
  return (
    // min-w-0 stops wide children (tables) from stretching grid/flex columns past the viewport.
    <Tag className={`min-w-0 rounded-lg border border-line bg-surface ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, subtitle, icon: Icon, actions, className = '' }) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3 ${className}`}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          {Icon && <Icon className="size-4 shrink-0 text-ink-3" aria-hidden="true" />}
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className = '', children }) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Two-column definition list used for event and device details. */
export function KeyValueList({ items, className = '' }) {
  return (
    <dl className={`grid grid-cols-1 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[max-content_1fr] ${className}`}>
      {items
        .filter((item) => item && !item.hidden)
        .map((item) => (
          <div key={item.label} className="contents">
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-3 sm:pt-0.5">{item.label}</dt>
            <dd className="min-w-0 break-words text-ink">{item.value ?? <span className="text-ink-3">—</span>}</dd>
          </div>
        ))}
    </dl>
  );
}
