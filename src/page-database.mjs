export const featuredProjectIds = [
  "eurocrate-storage-universal-solution",
  "placeholder-1",
  "placeholder-2"
];

export const pageDatabaseCollections = {
  projects: {
    cardVariant: "media",
    defaultCardSize: "lg",
    defaultCardFields: ["category", "year", "summary"],
    defaultDetailVisibility: {
      showHero: true,
      showMeta: ["lastUpdated", "notionLink"],
      showComments: false
    }
  },
  things_i_do: {
    cardVariant: "media-compact",
    defaultCardSize: "md",
    defaultCardFields: ["category"],
    defaultDetailVisibility: {
      showHero: true,
      showMeta: ["lastUpdated", "notionLink"],
      showComments: false
    }
  },
  "open-quests": {
    cardVariant: "text",
    defaultCardSize: "md",
    defaultCardFields: ["summary"],
    defaultDetailVisibility: {
      showHero: false,
      showMeta: ["lastUpdated", "notionLink"],
      showComments: false
    }
  },
  "cool-bookmarks": {
    cardVariant: "text",
    defaultCardSize: "sm",
    defaultCardFields: ["summary"],
    defaultDetailVisibility: {
      showHero: false,
      showMeta: ["dateAdded"],
      showComments: false
    }
  }
};

export const pageDatabaseItems = [
  {
    id: "placeholder-1",
    section: "projects",
    source: {
      type: "local"
    },
    content: {
      title: "Coming soon",
      summary: "Case study in progress.",
      image: "",
      alt: "Project placeholder"
    },
    meta: {
      category: "",
      year: ""
    },
    card: {
      size: "lg",
      fields: ["category", "year", "summary"],
      click: {
        mode: "status",
        label: "Coming soon",
        url: ""
      },
      layoutClass: "stack-wide"
    },
    detail: {
      enabled: false,
      showComments: false
    }
  },
  {
    id: "placeholder-2",
    section: "projects",
    source: {
      type: "local"
    },
    content: {
      title: "Coming soon",
      summary: "Case study in progress.",
      image: "",
      alt: "Project placeholder"
    },
    meta: {
      category: "",
      year: ""
    },
    card: {
      size: "lg",
      fields: ["category", "year", "summary"],
      click: {
        mode: "status",
        label: "Coming soon",
        url: ""
      },
      layoutClass: "stack-offset-lg"
    },
    detail: {
      enabled: false,
      showComments: false
    }
  },
  {
    id: "placeholder-3",
    section: "projects",
    source: {
      type: "local"
    },
    content: {
      title: "Coming soon",
      summary: "Case study in progress.",
      image: "",
      alt: "Project placeholder"
    },
    meta: {
      category: "",
      year: ""
    },
    card: {
      size: "lg",
      fields: ["category", "year", "summary"],
      click: {
        mode: "status",
        label: "Coming soon",
        url: ""
      }
    },
    detail: {
      enabled: false,
      showComments: false
    }
  },
  {
    id: "thing-placeholder-1",
    section: "things_i_do",
    source: {
      type: "local"
    },
    content: {
      title: "Coming soon",
      summary: "",
      image: "",
      alt: "Placeholder"
    },
    meta: {
      category: ""
    },
    card: {
      size: "md",
      fields: ["category"],
      click: {
        mode: "none",
        label: "",
        url: ""
      },
      layoutClass: "stack-wide"
    },
    detail: {
      enabled: false,
      showComments: false
    }
  },
  {
    id: "thing-placeholder-2",
    section: "things_i_do",
    source: {
      type: "local"
    },
    content: {
      title: "Coming soon",
      summary: "",
      image: "",
      alt: "Placeholder"
    },
    meta: {
      category: ""
    },
    card: {
      size: "md",
      fields: ["category"],
      click: {
        mode: "none",
        label: "",
        url: ""
      },
      layoutClass: "stack-offset-lg"
    },
    detail: {
      enabled: false,
      showComments: false
    }
  },
  {
    id: "thing-placeholder-3",
    section: "things_i_do",
    source: {
      type: "local"
    },
    content: {
      title: "Coming soon",
      summary: "",
      image: "",
      alt: "Placeholder"
    },
    meta: {
      category: ""
    },
    card: {
      size: "md",
      fields: ["category"],
      click: {
        mode: "none",
        label: "",
        url: ""
      }
    },
    detail: {
      enabled: false,
      showComments: false
    }
  },
  {
    id: "darkroom-build",
    section: "open-quests",
    source: {
      type: "local"
    },
    content: {
      title: "Darkroom build",
      summary:
        "An ongoing build at OMA Collective, balancing layout, workflow, and the practical details that make the room usable."
    },
    meta: {},
    card: {
      size: "md",
      fields: ["summary"],
      click: {
        mode: "none",
        label: "",
        url: ""
      }
    },
    detail: {
      enabled: false,
      showComments: false
    }
  },
  {
    id: "small-metal-casting-kiln",
    section: "open-quests",
    source: {
      type: "local"
    },
    content: {
      title: "Small metal casting kiln",
      summary:
        "Still being shaped through material choices, insulation decisions, and a lot of real-world trial and error."
    },
    meta: {},
    card: {
      size: "md",
      fields: ["summary"],
      click: {
        mode: "none",
        label: "",
        url: ""
      }
    },
    detail: {
      enabled: false,
      showComments: false
    }
  },
  {
    id: "workshop-process-notes",
    section: "open-quests",
    source: {
      type: "local"
    },
    content: {
      title: "Workshop process notes",
      summary:
        "A growing place for the smaller questions around prototyping, fabrication, fixtures, and useful ways of testing ideas quickly."
    },
    meta: {},
    card: {
      size: "md",
      fields: ["summary"],
      click: {
        mode: "none",
        label: "",
        url: ""
      }
    },
    detail: {
      enabled: false,
      showComments: false
    }
  },
  {
    id: "tools-and-references",
    section: "cool-bookmarks",
    source: {
      type: "local"
    },
    content: {
      title: "Tools and references",
      summary:
        "Useful pages for fabrication, prototyping, and figuring out practical details without overcomplicating them."
    },
    meta: {},
    card: {
      size: "sm",
      fields: ["summary"],
      click: {
        mode: "none",
        label: "",
        url: ""
      }
    },
    detail: {
      enabled: false,
      showComments: false
    }
  },
  {
    id: "people-and-projects",
    section: "cool-bookmarks",
    source: {
      type: "local"
    },
    content: {
      title: "People and projects",
      summary:
        "Studios, makers, and side projects worth revisiting when I want to see how other people solve things."
    },
    meta: {},
    card: {
      size: "sm",
      fields: ["summary"],
      click: {
        mode: "none",
        label: "",
        url: ""
      }
    },
    detail: {
      enabled: false,
      showComments: false
    }
  },
  {
    id: "materials-and-processes",
    section: "cool-bookmarks",
    source: {
      type: "local"
    },
    content: {
      title: "Materials and processes",
      summary:
        "Pages I want close by while learning more about analog work, metals, workshop setups, and physical making."
    },
    meta: {},
    card: {
      size: "sm",
      fields: ["summary"],
      click: {
        mode: "none",
        label: "",
        url: ""
      }
    },
    detail: {
      enabled: false,
      showComments: false
    }
  }
];
