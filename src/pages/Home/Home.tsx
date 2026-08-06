import "./Home.css";

const announcements = [
  {
    title: "Math Quiz tomorrow at 10:00 AM",
    date: "May 20, 2024",
  },
  {
    title: "New assignment posted in Physics",
    date: "May 18, 2024",
  },
  {
    title: "Axiom Game Night coming soon!",
    date: "May 15, 2024",
  },
];

const quickLinks = [
  { icon: "▣", label: "My Classes" },
  { icon: "□", label: "Calendar" },
  { icon: "▤", label: "Resources" },
  { icon: "✉", label: "Messages" },
];

function Home() {
  return (
    <section className="home-page">
      <div className="hero">
        <div className="hero__content">
          <p className="hero__eyebrow">
            Your learning dashboard
          </p>

          <h1 className="hero__title">
            Welcome back,
            <span> Fernie! 👋</span>
          </h1>

          <p className="hero__description">
            Keep learning. Keep growing.
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
            <h2>Announcements</h2>
            <button type="button">View all</button>
          </div>

          <div className="announcement-list">
            {announcements.map((announcement) => (
              <div
                className="announcement"
                key={announcement.title}
              >
                <span className="announcement__dot" />

                <div>
                  <h3>{announcement.title}</h3>
                  <p>{announcement.date}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

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