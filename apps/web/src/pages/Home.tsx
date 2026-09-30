import { Link } from "react-router-dom";

export function Home() {
  return (
    <div className="landing">
      <div className="landing-card">
        <h1>Bookarr</h1>
        <p>
          Radarr/Sonarr-style audiobook automation with Prowlarr indexers and an
          Overseerr-style request flow for friends and family.
        </p>
        <div className="landing-actions">
          <Link className="primary" to="/admin">
            Open admin
          </Link>
          <Link to="/request">Request an audiobook</Link>
        </div>
      </div>
    </div>
  );
}
