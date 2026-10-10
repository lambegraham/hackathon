export function GardenScenery() {
  return <div className="scenery" aria-hidden="true">
    <span className="cloud cloud-a" /><span className="cloud cloud-b" /><span className="cloud cloud-c" />
    <svg className="hills" viewBox="0 0 1440 420" preserveAspectRatio="none">
      <path d="M0 210C180 90 330 120 480 180s300 10 470-90 330 20 490 70v260H0z" fill="#b9cfa8" />
      <path d="M0 290c200-90 380-60 560 0s340 40 520-30 280-40 360 0v160H0z" fill="#93b77f" />
      <path d="M0 360c240-60 480-50 720 0s480 40 720-10v70H0z" fill="#79a564" />
    </svg>
  </div>;
}
