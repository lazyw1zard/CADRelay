import { Link } from "react-router-dom";

const DEMO_MODELS = [
  { id: "m1", title: "Print-ready clamp set", author: "CADRelay Team", likes: 124, downloads: 906 },
  { id: "m2", title: "Compact enclosure box", author: "Denis Lab", likes: 87, downloads: 522 },
  { id: "m3", title: "Universal tool holder", author: "Forge Hub", likes: 201, downloads: 1331 },
  { id: "m4", title: "Stepper bracket pack", author: "MVP Studio", likes: 64, downloads: 402 },
  { id: "m5", title: "Cable organizer v2", author: "Relay Makers", likes: 149, downloads: 978 },
  { id: "m6", title: "Parametric hinge", author: "Proto Works", likes: 93, downloads: 615 },
];

export function ExplorePage() {
  return (
    <div className="explore-page">
      <section className="explore-hero">
        <div>
          <h1>Explore CAD Models</h1>
          <p>Быстрый просмотр и скачивание моделей. Залогинься, чтобы загружать свои версии и отправлять на review.</p>
        </div>
        <div className="explore-hero-actions">
          <Link to="/workspace" className="btn-primary">
            Open Workspace
          </Link>
          <Link to="/auth" className="btn-ghost">
            Sign in / Sign up
          </Link>
        </div>
      </section>

      <section className="explore-grid">
        {DEMO_MODELS.map((model, idx) => (
          <article key={model.id} className="model-card">
            <div className={`model-card-cover model-card-cover-${(idx % 3) + 1}`} />
            <div className="model-card-body">
              <h3>{model.title}</h3>
              <p>{model.author}</p>
              <div className="model-card-meta">
                <span>{model.downloads} downloads</span>
                <span>{model.likes} likes</span>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
