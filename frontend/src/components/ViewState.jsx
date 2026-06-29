import Badge from './Badge';

export default function ViewState({
  as: Component = 'section',
  className,
  badge,
  badgeTone = 'subtle',
  title,
  copy,
  detail,
}) {
  return (
    <Component className={className}>
      {badge ? <Badge tone={badgeTone}>{badge}</Badge> : null}
      <h3>{title}</h3>
      <p>{copy}</p>
      {detail ? <small>{detail}</small> : null}
    </Component>
  );
}
