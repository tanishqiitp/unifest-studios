// ---------------------------------------------------------------------------------------------
// Home page content you edit by hand: clients, testimonials and milestones.
//
// How to update:
//  - Add an entry, set `published: true`, and give it an `order` (lower numbers show first).
//  - Logos and photos: put the file in /public/clients or /public/people and use '/clients/name.png'.
//    Only use logos and photos you have permission to show.
//  - Entries with `sample: true` are layout placeholders. They show ONLY in development
//    (npm run dev) or when the page is opened with ?demo in the address. Never on the live site.
//  - A section with no published, non-sample entries is hidden on the live site
//    (testimonials show the "Share your experience" invitation instead).
//  - Testimonials come from real people who agreed to be published. Submissions from the
//    "Share your experience" form are stored privately in Supabase (testimonial_submissions,
//    status 'pending'); copy approved ones (consent_publish = true) here.
// ---------------------------------------------------------------------------------------------

export interface Client {
  name: string
  logo?: string
  website?: string
  project?: string
  order: number
  published: boolean
  sample?: boolean
}

export interface Testimonial {
  name: string
  role: string
  review: string
  photo?: string // only with the person's consent
  order: number
  published: boolean
  sample?: boolean
}

export interface Milestone {
  date: string // year or date, e.g. '2026' or 'Nov 2026'
  title: string
  description: string
  order: number
  published: boolean
}

export const CLIENTS: Client[] = [
  { name: 'Your College / University', project: 'Annual cultural fest', order: 1, published: true, sample: true },
  { name: 'Your Event Brand', project: 'Music festival', order: 2, published: true, sample: true },
  { name: 'Your Corporate Partner', project: 'Product launch', order: 3, published: true, sample: true },
  { name: 'Your Production Partner', project: 'Stage and LED production', order: 4, published: true, sample: true },
]

export const TESTIMONIALS: Testimonial[] = [
  {
    name: 'Aarav Sharma',
    role: 'Sample college event coordinator',
    review: 'Having the ground layout, stage, and LED planning in one workspace makes it easier to explain our event concept to the team.',
    order: 1,
    published: true,
    sample: true,
  },
  {
    name: 'Priya Mehta',
    role: 'Sample event planner',
    review: 'The visual planning approach helps us discuss the setup with clients and organise changes before the event.',
    order: 2,
    published: true,
    sample: true,
  },
  {
    name: 'Rohan Verma',
    role: 'Sample production coordinator',
    review: 'Bringing design details and equipment requirements together makes production discussions more organised.',
    order: 3,
    published: true,
    sample: true,
  },
]

// "Our Journey" stays hidden until factual milestones are added here with published: true.
export const MILESTONES: Milestone[] = []

export const COMPANY = {
  office: 'Bhamashah Techno Hub, Jhalana Dungri, Jaipur, Rajasthan, India',
  email: 'info@unifestentertainment.com',
  phone: '+91 7742649943',
  phoneHref: 'tel:+917742649943',
  website: 'https://unifestentertainment.com/',
}
export const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(COMPANY.office)}`

// Samples show in development or with ?demo in the address.
export const showSamples = () => import.meta.env.DEV || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo'))

export function visible<T extends { published: boolean; order: number; sample?: boolean }>(list: T[]) {
  const demo = showSamples()
  return list.filter((x) => x.published && (!x.sample || demo)).sort((a, b) => a.order - b.order)
}
