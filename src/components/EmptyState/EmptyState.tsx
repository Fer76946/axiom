export default function EmptyState(
  { title, description }: { title: string; description: string },
) {
  return (
    <div className="empty-state">
      <span className="empty-state__mark" aria-hidden="true">◇</span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
