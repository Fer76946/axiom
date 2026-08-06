import "./Axiom.css";

function Axiom() {
  return (
    <section className="axiom-page">
      <div className="rocket-illustration" aria-hidden="true">
        <div className="rocket">
          <span className="rocket__window" />
          <span className="rocket__flame" />
        </div>
      </div>

      <h1>Axiom is Coming Soon!</h1>

      <p>
        Get ready for an interactive learning adventure.
        <br />
        Compete. Explore. Learn.
      </p>

      <button type="button">Learn More</button>
    </section>
  );
}

export default Axiom;