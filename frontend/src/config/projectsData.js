
export const PURVA_CITIES_PROJECTS = {
  "Bengaluru": [
    {
      id: "purva-heritage",
      name: "Purva Heritage",
      location: "Kudlu Gate, Bengaluru",
      image: "/purva_heritage.jpg",
      status: "Newly Launched",
      type: "Residential"
    },
    {
      id: "northern-lights",
      name: "Northern Lights by Puravankara | KVN",
      location: "KIADB, Aerospace Park, Bengaluru",
      image: "/purva_complex.jpg",
      status: "Newly Launched",
      type: "Residential"
    },
    {
      id: "purva-silversky",
      name: "Purva Silversky",
      location: "Electronic City, Bengaluru",
      image: "/purva_complex.jpg",
      status: "Newly Launched",
      type: "Residential"
    },
    {
      id: "purva-blubelle",
      name: "Purva Blubelle",
      location: "Magadi Road, Bengaluru",
      image: "/purva_heritage.jpg",
      status: "Ongoing",
      type: "Residential"
    },
    {
      id: "purva-orient-grand",
      name: "Purva Orient Grand",
      location: "Lalbagh Road, Bengaluru",
      image: "/purva_heritage.jpg",
      status: "Ongoing",
      type: "Luxury Residential"
    },
    {
      id: "purva-atmosphere",
      name: "Purva Atmosphere",
      location: "Thanisandra Road, Bengaluru",
      image: "/purva_complex.jpg",
      status: "Ongoing",
      type: "Residential"
    },
    {
      id: "bengaluru-corporate",
      name: "Bengaluru Corporate Head Office",
      location: "Ulsoor Road, Bengaluru",
      image: "/puravankara_building.png",
      status: "Headquarters",
      type: "Corporate Operations"
    }
  ],
  "Chennai": [
    {
      id: "purva-somerset",
      name: "Purva Somerset House",
      location: "Guindy, Chennai",
      image: "/purva_heritage.jpg",
      status: "Ongoing",
      type: "Luxury Residential"
    },
    {
      id: "purva-windermere",
      name: "Purva Windermere",
      location: "Pallikaranai, Chennai",
      image: "/purva_complex.jpg",
      status: "Completed / Handover",
      type: "Residential"
    }
  ],
  "Mumbai": [
    {
      id: "purva-clermont",
      name: "Purva Clermont",
      location: "Chembur, Mumbai",
      image: "/purva_complex.jpg",
      status: "Newly Launched",
      type: "Residential"
    }
  ],
  "Pune": [
    {
      id: "purva-silversands",
      name: "Purva Silversands",
      location: "Mundhwa, Pune",
      image: "/purva_heritage.jpg",
      status: "Ongoing",
      type: "Residential"
    }
  ],
  "Hyderabad": [
    {
      id: "purva-summit",
      name: "Purva Summit",
      location: "HITEC City, Hyderabad",
      image: "/purva_complex.jpg",
      status: "Commercial & Tech",
      type: "Commercial"
    }
  ],
  "Kochi": [
    {
      id: "purva-grandbay",
      name: "Purva GrandBay",
      location: "Marine Drive, Kochi",
      image: "/purva_bengaluru_balcony.jpg",
      status: "Completed",
      type: "Luxury Waterfront"
    }
  ],
  "Coimbatore": [
    {
      id: "purva-amaiti",
      name: "Purva Amaiti",
      location: "Singanallur, Coimbatore",
      image: "/purva_complex.jpg",
      status: "Ongoing",
      type: "Residential"
    }
  ]
};

export const findProjectByNameOrId = (identifier) => {
  if (!identifier) return null;
  const clean = identifier.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const city of Object.keys(PURVA_CITIES_PROJECTS)) {
    for (const proj of PURVA_CITIES_PROJECTS[city]) {
      const projCleanId = proj.id.toLowerCase().replace(/[^a-z0-9]/g, "");
      const projCleanName = proj.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (
        projCleanId.includes(clean) ||
        clean.includes(projCleanId) ||
        projCleanName.includes(clean) ||
        clean.includes(projCleanName)
      ) {
        return { ...proj, city };
      }
    }
  }
  return {
    id: "custom-site",
    name: identifier,
    location: "Puravankara Development Site",
    image: "/purva_heritage.jpg",
    status: "Project Site",
    city: "Bengaluru"
  };
};

export const PURVA_CITIES = Object.keys(PURVA_CITIES_PROJECTS);
