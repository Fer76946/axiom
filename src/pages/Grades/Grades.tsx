import "./Grades.css";

function Grades() {
  return (
    <section className="grades-page">
      <header className="grades-heading">
        <h1>My Grades</h1>
        <p>View your current class and grade.</p>
      </header>

      <article className="grade-card">
        <div className="grade-card__header">
          <span>Class</span>
          <h2>Science - 6A</h2>
        </div>

        <div className="grade-card__current">
          <span>Current Grade:</span>
          <strong>92%</strong>
        </div>
      </article>
    </section>
  );
}

export default Grades;