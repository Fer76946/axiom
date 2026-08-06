import "./Grades.css";

const classes = [
  { name: "Calculus I", grade: 93, icon: "∫" },
  { name: "Physics", grade: 90, icon: "⚛" },
  { name: "Computer Science", grade: 95, icon: "</>" },
  { name: "English Literature", grade: 88, icon: "▣" },
  { name: "History", grade: 85, icon: "▥" },
];

function Grades() {
  return (
    <section className="grades-page">
      <header className="grades-heading">
        <h1>My Grades</h1>
        <p>Track your progress across all classes.</p>
      </header>

      <div className="grade-summary">
        <article className="summary-card">
          <span>Overall Average</span>
          <strong className="summary-card__grade">92%</strong>
          <small>Excellent</small>
        </article>

        <article className="summary-card">
          <span>Classes</span>
          <strong>5</strong>
        </article>

        <article className="summary-card">
          <span>Completed</span>
          <strong>28</strong>
          <small>Assignments</small>
        </article>

        <article className="summary-card summary-card--warning">
          <span>Due Soon</span>
          <strong>3</strong>
          <small>Assignments</small>
        </article>
      </div>

      <article className="class-overview">
        <h2>Class Overview</h2>

        <div className="class-list">
          {classes.map((classItem) => (
            <div className="class-row" key={classItem.name}>
              <span className="class-row__icon">{classItem.icon}</span>

              <strong>{classItem.name}</strong>

              <div className="class-row__progress">
                <span style={{ width: `${classItem.grade}%` }} />
              </div>

              <span className="class-row__grade">{classItem.grade}%</span>
              <span className="class-row__arrow">›</span>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

export default Grades;