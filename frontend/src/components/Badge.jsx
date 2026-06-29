export default function Badge({ tone = 'subtle', className = '', children, ...props }) {
  const classes = ['ui-badge', tone, className].filter(Boolean).join(' ');

  return (
    <span className={classes} {...props}>
      {children}
    </span>
  );
}
