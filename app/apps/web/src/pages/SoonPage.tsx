import { TopBar } from '../components/Layout';

export function SoonPage({ title }: { title: string }) {
  return (
    <>
      <TopBar title={title} />
      <section className="panel" style={{ maxWidth: 720 }}>
        <div className="empty">
          <p>Этот раздел появится на следующем этапе.</p>
        </div>
      </section>
    </>
  );
}
