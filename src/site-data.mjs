export const site = {
  name: "Evren Ucar",
  domain: "evrenucar.com",
  url: "https://evrenucar.com",
  email: "evrenucar1999@gmail.com",
  headline: "Industrial design engineer, prototyper, and hands-on maker.",
  description:
    "Portfolio website for Evren Ucar, a TU Delft graduate and freelance industrial design engineer working across mechanics, electronics, prototyping, and hands-on making.",
  location: "Netherlands",
  social: {
    linkedin: "https://www.linkedin.com/in/evren-u%C3%A7ar-b335971b4/",
    youtube: "https://www.youtube.com/channel/UClIvijrVKdvasECOonGPomw"
  }
};

export const navigation = [
  { label: "About Me", href: "index.html" },
  { label: "Projects", href: "projects.html" },
  { label: "Things I Do", href: "things_i_do.html" },
  { label: "Photography", href: "photography.html" }
];

export const homePage = {
  title: "Evren Ucar | Industrial Design Engineer and Maker",
  description:
    "Evren Ucar is a TU Delft graduate and freelance industrial design engineer developing physical products through mechanics, electronics, prototyping, and practical problem-solving.",
  hero: {
    eyebrow: "About me",
    titleLead: "Hi there. I'm",
    titleHighlight: "Evren Ucar.",
    intro: [
      "I am Evren Ucar, a TU Delft graduate and freelance industrial design engineer. Most of my work happens in the messy part between a rough idea and something you can hold, test, break, and improve.",
      "That usually means product development through mechanics, electronics, prototyping, and practical problem-solving. I like making progress tangible early, then improving it through use.",
      "Outside of work I keep gravitating to the same kind of making through analog photography, lino printing, metalworking, and other hands-on processes. At OMA Collective I am currently helping build a darkroom and a small metal casting kiln, while also getting pulled into resin printing, welding, machine building, and woodworking."
    ],
    image: {
      src: "image/masked_photo.png",
      alt: "Portrait of Evren Ucar"
    }
  },
  facts: [
    {
      label: "Background",
      value: "TU Delft graduate"
    },
    {
      label: "Work",
      value: "Freelance industrial design engineer"
    },
    {
      label: "Current focus",
      value: "Darkroom and small kiln build at OMA Collective"
    }
  ],
  services: [
    {
      title: "Product development",
      copy: "Turning early concepts into workable product directions with clear tradeoffs and physical proof."
    },
    {
      title: "Prototyping",
      copy: "Building mockups, test rigs, and practical iterations that reveal what actually needs to change."
    },
    {
      title: "Mechanics and electronics",
      copy: "Bringing enough engineering into the process to make ideas behave in the real world."
    }
  ],
  process: [
    {
      title: "Start simple",
      copy: "I try to get to a physical version early, even if it is rough."
    },
    {
      title: "Test honestly",
      copy: "The point is not to protect the idea. It is to learn where it fails."
    },
    {
      title: "Improve in context",
      copy: "Changes matter more when they come from use, handling, assembly, and real constraints."
    }
  ],
  seoKeywords: [
    "industrial design engineer",
    "freelance industrial designer",
    "prototype development",
    "product development portfolio",
    "mechanics and electronics prototyping",
    "maker portfolio"
  ]
};

export const projects = [
  {
    slug: "bubble",
    title: "Bubble",
    year: "2021",
    category: "Product concept",
    image: "projects/thumb_1.png",
    alt: "Bubble project thumbnail",
    summary:
      "A concept project focused on a clear product idea, approachable form, and a direction that could move toward production.",
    status: "Case study soon",
    externalUrl: ""
  },
  {
    slug: "axis",
    title: "Axis",
    year: "2021",
    category: "Concept development",
    image: "projects/thumb_2.png",
    alt: "Axis project thumbnail",
    summary:
      "A project built around movement, control, and the relationship between form and mechanical behavior.",
    status: "Case study soon",
    externalUrl: ""
  },
  {
    slug: "moto-gimbal",
    title: "Moto Gimbal",
    year: "2021",
    category: "Mobility accessory",
    image: "projects/thumb_3.jpg",
    alt: "Moto Gimbal project thumbnail",
    summary:
      "A motorcycle camera gimbal concept looking at mounting, stability, and a more usable filming setup on the road.",
    status: "Case study soon",
    externalUrl: ""
  },
  {
    slug: "mono-wheel",
    title: "Mono Wheel",
    year: "2020",
    category: "Mobility concept",
    image: "projects/thumb_4.png",
    alt: "Mono Wheel project thumbnail",
    summary:
      "A mobility exploration shaped by balance, compact packaging, and the practical feel of a rideable object.",
    status: "Case study soon",
    externalUrl: ""
  },
  {
    slug: "makerlight",
    title: "MakerLight",
    year: "2020",
    category: "Workshop product",
    image: "projects/thumb_5.png",
    alt: "MakerLight project thumbnail",
    summary:
      "A lighting concept for hands-on work, with attention to usability, placement, and workshop conditions.",
    status: "Case study soon",
    externalUrl: ""
  },
  {
    slug: "wine-and-cheese-picnic-set",
    title: "Wine and Cheese Picnic Set",
    year: "2020",
    category: "Lifestyle product",
    image: "projects/thumb_6.png",
    alt: "Wine and Cheese Picnic Set project thumbnail",
    summary:
      "A portable serving set shaped around carrying, setup, and the small details that make an outdoor product pleasant to use.",
    status: "Case study soon",
    externalUrl: ""
  }
];

export const featuredProjectSlugs = ["moto-gimbal", "mono-wheel", "makerlight"];

export const makingPage = {
  title: "Things I Do | Evren Ucar",
  description:
    "A broader archive of smaller builds, repairs, fabrication tests, renderings, and workshop experiments by Evren Ucar.",
  intro: [
    "Not every useful thing becomes a full case study. This page is for the smaller builds, workshop fixes, fabrication tests, and quick ideas that still say something about how I work.",
    "Some are practical. Some are just experiments. Most of them come from wanting to understand a material, a process, or a problem a bit better."
  ]
};

export const makingItems = [
  {
    title: "3DP Mk3 Stand",
    category: "3D printed workshop tool",
    image: "things_i_do/thumb_1.png",
    alt: "3D printed Mk3 stand"
  },
  {
    title: "Heavy Duty Wheel",
    category: "Mechanical prototype",
    image: "things_i_do/thumb_2.png",
    alt: "Heavy duty wheel prototype"
  },
  {
    title: "Screen Holder",
    category: "Quick fixture",
    image: "things_i_do/thumb_3.png",
    alt: "Screen holder prototype"
  },
  {
    title: "Stereo RaspiCAM Holder",
    category: "Camera rig",
    image: "things_i_do/thumb_4.jpg",
    alt: "Stereo RaspiCAM holder"
  },
  {
    title: "Marker Revival",
    category: "Repair",
    image: "things_i_do/thumb_5.jpg",
    alt: "Marker repair project"
  },
  {
    title: "RC Rover Model",
    category: "CAD model",
    image: "things_i_do/thumb_22.png",
    alt: "RC rover model"
  },
  {
    title: "3DP Bearing",
    category: "Print test",
    image: "things_i_do/thumb_7.jpg",
    alt: "3D printed bearing"
  },
  {
    title: "Frutti Rendering",
    category: "Visualization",
    image: "things_i_do/thumb_8.jpg",
    alt: "Frutti rendering"
  },
  {
    title: "METU MECH T-Shirt",
    category: "Graphic work",
    image: "things_i_do/thumb_9.jpg",
    alt: "METU mechanical engineering T-shirt design"
  },
  {
    title: "TOS Machine Lathe",
    category: "Workshop process",
    image: "things_i_do/thumb_10.jpg",
    alt: "TOS machine lathe"
  },
  {
    title: "Precision Bed Levelling",
    category: "Calibration",
    image: "things_i_do/thumb_11.jpg",
    alt: "Precision bed levelling"
  },
  {
    title: "3DP Adhesive Wallhook",
    category: "Household fix",
    image: "things_i_do/thumb_12.jpg",
    alt: "3D printed adhesive wall hook"
  },
  {
    title: "TI-84 Restoration",
    category: "Electronics repair",
    image: "things_i_do/thumb_13.png",
    alt: "TI-84 calculator restoration"
  },
  {
    title: "3DP TT Paddle",
    category: "Sports experiment",
    image: "things_i_do/thumb_14.png",
    alt: "3D printed table tennis paddle"
  },
  {
    title: "Sourdough Bread",
    category: "Hands-on process",
    image: "things_i_do/thumb_15.png",
    alt: "Sourdough bread"
  },
  {
    title: "Metal Spinning Top",
    category: "Turning practice",
    image: "things_i_do/thumb_16.png",
    alt: "Metal spinning top"
  },
  {
    title: "Support Bearing Holder",
    category: "Fixture",
    image: "things_i_do/thumb_17.png",
    alt: "Support bearing holder"
  },
  {
    title: "Cardboard Sandbox Event",
    category: "Workshop build",
    image: "things_i_do/thumb_18.png",
    alt: "Cardboard sandbox event build"
  },
  {
    title: "OTT First Event Award 2018",
    category: "Event object",
    image: "things_i_do/thumb_19.png",
    alt: "Event award object"
  },
  {
    title: "3DP Lamp Repair",
    category: "Repair",
    image: "things_i_do/thumb_20.png",
    alt: "3D printed lamp repair"
  },
  {
    title: "Nerf Marker Renderings",
    category: "Concept rendering",
    image: "things_i_do/thumb_21.png",
    alt: "Marker rendering concepts"
  }
];

export const photographyPage = {
  title: "Photography | Evren Ucar",
  description:
    "A selection of analog photography from Evren Ucar. Mostly quiet observations, materials, places, and moments that feel worth holding onto.",
  intro: [
    "Photography gives me another way to stay close to materials, light, and timing. I mostly use it as a slower way of looking.",
    "This is a small analog photo selection. You can tap any image to view it larger."
  ]
};

export const photographyItems = [
  {
    title: "Archive 01",
    image: "random_photos/1_normal.jpg",
    alt: "Analog photograph from Evren Ucar archive 01",
    span: ""
  },
  {
    title: "Archive 02",
    image: "random_photos/2_normal.jpg",
    alt: "Analog photograph from Evren Ucar archive 02",
    span: ""
  },
  {
    title: "Archive 03",
    image: "random_photos/1_vertical.jpg",
    alt: "Analog photograph from Evren Ucar archive 03",
    span: "photo-vertical"
  },
  {
    title: "Archive 04",
    image: "random_photos/3_normal.jpg",
    alt: "Analog photograph from Evren Ucar archive 04",
    span: ""
  },
  {
    title: "Archive 05",
    image: "random_photos/1_big.jpg",
    alt: "Analog photograph from Evren Ucar archive 05",
    span: "photo-big"
  },
  {
    title: "Archive 06",
    image: "random_photos/4_normal.jpg",
    alt: "Analog photograph from Evren Ucar archive 06",
    span: ""
  },
  {
    title: "Archive 07",
    image: "random_photos/4_vertical.jpg",
    alt: "Analog photograph from Evren Ucar archive 07",
    span: "photo-vertical"
  },
  {
    title: "Archive 08",
    image: "random_photos/5_normal.jpg",
    alt: "Analog photograph from Evren Ucar archive 08",
    span: ""
  },
  {
    title: "Archive 09",
    image: "random_photos/6_normal.jpg",
    alt: "Analog photograph from Evren Ucar archive 09",
    span: ""
  },
  {
    title: "Archive 10",
    image: "random_photos/2_big.jpg",
    alt: "Analog photograph from Evren Ucar archive 10",
    span: "photo-big"
  },
  {
    title: "Archive 11",
    image: "random_photos/1_horizontal.jpg",
    alt: "Analog photograph from Evren Ucar archive 11",
    span: "photo-horizontal"
  },
  {
    title: "Archive 12",
    image: "random_photos/2_vertical.jpg",
    alt: "Analog photograph from Evren Ucar archive 12",
    span: "photo-vertical"
  },
  {
    title: "Archive 13",
    image: "random_photos/7_normal.jpg",
    alt: "Analog photograph from Evren Ucar archive 13",
    span: ""
  },
  {
    title: "Archive 14",
    image: "random_photos/8_normal.jpg",
    alt: "Analog photograph from Evren Ucar archive 14",
    span: ""
  },
  {
    title: "Archive 15",
    image: "random_photos/9_normal.jpg",
    alt: "Analog photograph from Evren Ucar archive 15",
    span: ""
  },
  {
    title: "Archive 16",
    image: "random_photos/3_big.jpg",
    alt: "Analog photograph from Evren Ucar archive 16",
    span: "photo-big"
  },
  {
    title: "Archive 17",
    image: "random_photos/3_vertical.jpg",
    alt: "Analog photograph from Evren Ucar archive 17",
    span: "photo-vertical"
  },
  {
    title: "Archive 18",
    image: "random_photos/10_normal.jpg",
    alt: "Analog photograph from Evren Ucar archive 18",
    span: ""
  },
  {
    title: "Archive 19",
    image: "random_photos/11_normal.jpg",
    alt: "Analog photograph from Evren Ucar archive 19",
    span: ""
  },
  {
    title: "Archive 20",
    image: "random_photos/12_normal.jpg",
    alt: "Analog photograph from Evren Ucar archive 20",
    span: ""
  }
];

export const placeholderPage = {
  title: "Case Study in Progress | Evren Ucar",
  description:
    "This case study page is being rebuilt. Short summaries are already live on the main site, and longer writeups will follow.",
  heading: "Case study in progress",
  copy:
    "The short version is already live on the main site. The longer breakdown is still being rebuilt so it is easier to update and later connect to Notion."
};

export const seo = {
  defaultImage: "image/masked_photo.png"
};
