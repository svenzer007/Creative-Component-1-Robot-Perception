export interface Source {
  label: string;
  url: string;
}

export interface Application {
  id: string;
  category: string;
  accent: 'c1' | 'c2' | 'plane' | 'epiline' | 'actual' | 'warning';
  title: string;
  hook: string;
  body: string;
  epipolar: string;
  stat: string;
  statLabel: string;
  sources: Source[];
}

export const APPLICATIONS: Application[] = [
  {
    id: 'mars',
    category: 'Space',
    accent: 'c2',
    title: 'A rover that drives itself on Mars',
    hook: 'Perseverance does not wait for a human to steer around every rock.',
    body:
      'Its AutoNav software builds 3D maps of the terrain ahead, identifies hazards and plans a route around them. The navigation cameras that feed it are a stereo pair: two cameras, side by side, looking at the same ground.',
    epipolar:
      'For any pixel in the left camera, the matching pixel in the right camera must lie on one epipolar line. Matching along that line and triangulating the two rays turns a pair of flat images into the distance to every rock.',
    stat: '42.4 cm',
    statLabel: 'Navcam stereo baseline',
    sources: [
      { label: 'Maki et al., Space Science Reviews (2020)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7686239' },
      { label: 'NASA: Self-driving Perseverance takes the wheel', url: 'https://www.nasa.gov/solar-system/nasas-self-driving-perseverance-mars-rover-takes-the-wheel/' },
    ],
  },
  {
    id: 'mantis',
    category: 'Nature',
    accent: 'epiline',
    title: 'Praying mantises wearing 3D glasses',
    hook: 'Researchers glued tiny 3D glasses onto praying mantises with beeswax to test how insects see depth.',
    body:
      'The glasses let the team show each eye a different image, making virtual prey appear to float in front of the mantis. Mantises do use two eyes for depth. The surprise: they do not match fine details between the eyes like we do. They match where the scene is changing, and it still works when the two images look completely different.',
    epipolar:
      'Two eyes are two cameras with a baseline. Depth comes from where the same thing lands in each view. The mantis solves the same correspondence problem, just with motion instead of texture.',
    stat: '2018',
    statLabel: 'Published in Current Biology',
    sources: [
      { label: 'Newcastle University press release (2018)', url: 'https://www.ncl.ac.uk/press/articles/archive/2018/02/newformof3dvisiondiscoveredinprayingmantis/' },
    ],
  },
  {
    id: 'eyes',
    category: 'Nature',
    accent: 'plane',
    title: 'Why a cat’s eyes face forward',
    hook: 'Many predatory mammals, like cats and primates, have forward-facing eyes. Most animals have eyes on the sides of their heads.',
    body:
      'Forward eyes give a large region seen by both eyes at once. Side eyes give a wide, almost panoramic view but little overlap. Biologists still debate exactly why each design evolved.',
    epipolar:
      'Triangulation only works where both views see the same point. More overlap means more of the world can be measured in depth; less overlap trades depth for field of view. It is the same design choice robot builders face when placing two cameras.',
    stat: 'Overlap',
    statLabel: 'Where depth is possible',
    sources: [
      { label: 'Larsson, Frontiers in Ecology and Evolution (2015)', url: 'https://www.frontiersin.org/articles/10.3389/fevo.2015.00089/pdf' },
    ],
  },
  {
    id: 'hawkeye',
    category: 'Sports',
    accent: 'c1',
    title: '“In or out?” decided by triangulation',
    hook: 'Hawk-Eye line calls in tennis, cricket and more come from cameras around the stadium, not a referee’s eyes.',
    body:
      'Up to ten high-performance cameras watch the ball. For each frame, the ball must be found in at least two separate cameras, and their views are combined into a 3D trajectory.',
    epipolar:
      'Once the ball is found in one camera, it can only appear along one epipolar line in another camera. Two viewing rays from two cameras meet at the ball’s 3D position.',
    stat: '20+',
    statLabel: 'sports use Hawk-Eye',
    sources: [{ label: 'Hawk-Eye (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Hawk-Eye' }],
  },
  {
    id: 'surgery',
    category: 'Medicine',
    accent: 'actual',
    title: 'Seeing inside the body in 3D',
    hook: 'Surgeons operating with the da Vinci robot look through a camera that has two eyes of its own.',
    body:
      'Its endoscope carries two high-resolution cameras. Like human eyes, they produce a true 3D picture that the surgeon sees through twin eyepieces at the console.',
    epipolar:
      'A tiny baseline between the two cameras creates disparity between the images, and disparity encodes depth. That depth lets a surgeon judge how far an instrument is from tissue.',
    stat: '2',
    statLabel: 'cameras in one endoscope',
    sources: [{ label: 'UC Irvine Urology: da Vinci Surgical System', url: 'https://www.urology.uci.edu/prostate/daVinci.html' }],
  },
  {
    id: 'cars',
    category: 'Cars',
    accent: 'warning',
    title: 'A car that brakes because it sees in stereo',
    hook: 'Subaru’s EyeSight watches the road with two cameras mounted near the top of the windshield.',
    body:
      'It uses the parallax between the two cameras to detect obstacles and pedestrians, and it can apply the brakes on its own if the driver does not.',
    epipolar:
      'In a rectified stereo pair, epipolar lines are horizontal rows, so a match is searched along one row. The shift between the two images (disparity d) gives distance: Z = fB / d.',
    stat: 'Z = fB/d',
    statLabel: 'depth from disparity',
    sources: [{ label: 'The Truth About Cars: Subaru EyeSight (2012)', url: 'https://www.thetruthaboutcars.com/2012/03/subaru-uses-stereo-3d-tech-in-new-eyesight-adas' }],
  },
  {
    id: 'avatar',
    category: 'Film',
    accent: 'c2',
    title: 'How Avatar was filmed in 3D',
    hook: 'Avatar was shot with a rig of two cameras whose spacing changed from shot to shot.',
    body:
      'The Fusion 3D system controlled the distance between the two cameras and their convergence. Some shots used just 1/3 inch between the lenses, others up to 2 inches.',
    epipolar:
      'That spacing is the baseline. A wider baseline means larger disparity and a stronger sense of depth; a narrower one gives a gentler 3D effect.',
    stat: '⅓–2 in',
    statLabel: 'baseline range on set',
    sources: [{ label: 'American Cinematographer: Avatar', url: 'https://theasc.com/articles/avatar' }],
  },
  {
    id: 'maps',
    category: 'Maps',
    accent: 'c1',
    title: 'Whole cities rebuilt from photos',
    hook: 'The 3D buildings in Google Earth come from airplanes taking photos from several angles at once.',
    body:
      'Planes carry five cameras, one pointing down and four angled. Software estimates depth from the overlapping photos, merges the depth maps into a 3D mesh and paints the photos back on.',
    epipolar:
      'Every overlapping pair of photos has its own epipolar geometry. Matching points across many views and triangulating them is what turns photos into geometry.',
    stat: '5',
    statLabel: 'cameras per aircraft',
    sources: [{ label: 'PhoneArena: How Google Earth’s 3D imagery is made', url: 'https://phonearena.com/news/Google-explains-how-Earths-incredible-3D-imagery-and-the-Pixel-live-wallpapers-are-done_id93224' }],
  },
];

export interface BaselineEntry {
  label: string;
  cm: number;
  display: string;
  source: Source;
}

/** Real stereo baselines, all in centimetres. */
export const BASELINES: BaselineEntry[] = [
  { label: 'Avatar camera rig (narrowest)', cm: 0.85, display: '≈0.85 cm', source: { label: 'American Cinematographer', url: 'https://theasc.com/articles/avatar' } },
  { label: 'Avatar camera rig (widest)', cm: 5.08, display: '≈5.1 cm', source: { label: 'American Cinematographer', url: 'https://theasc.com/articles/avatar' } },
  { label: 'Human eyes (adult average)', cm: 6.3, display: '≈6.2–6.4 cm', source: { label: 'Pupillary distance (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Pupillary_distance' } },
  { label: 'Perseverance front Hazcams', cm: 24.8, display: '24.8 cm', source: { label: 'Maki et al. (2020)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7686239' } },
  { label: 'Perseverance Navcams', cm: 42.4, display: '42.4 cm', source: { label: 'Maki et al. (2020)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7686239' } },
  { label: 'Perseverance rear Hazcams', cm: 93.4, display: '93.4 cm', source: { label: 'Maki et al. (2020)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7686239' } },
];
