import "./Home.css";


const quickLinks = [
  { icon: "▣", label: "Grades" },
  { icon: "□", label: "Axiom" },
];

function Home() {
  return (
    <section className="home-page">
      <div className="hero">
        <div className="hero__content">
          <p className="hero__eyebrow">
            Axiom
          </p>

          <h1 className="hero__title">
            Welcome to <span>Axiom</span>
          </h1>

          <p className="hero__description">
            View your grades and access your classroom tools.
          </p>

          <button className="primary-button" type="button">
            View My Grades
          </button>
        </div>

        <div className="hero__illustration" aria-hidden="true">
          <div className="illustration-chart">
            <span />
            <span />
            <span />
            <span />
          </div>

          <div className="illustration-books">
            <div />
            <div />
            <div />
          </div>

          <div className="illustration-plant">
            <span />
            <span />
            <i />
          </div>
        </div>
      </div>

      <div className="dashboard-grid">

        <article className="dashboard-card">
          <div className="card-heading">
            <h2>Quick Links</h2>
          </div>

          <div className="quick-links">
            {quickLinks.map((link) => (
              <button
                className="quick-link"
                type="button"
                key={link.label}
              >
                <span className="quick-link__icon">
                  {link.icon}
                </span>

                <span>{link.label}</span>
                <span className="quick-link__arrow">›</span>
              </button>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

export default Home;