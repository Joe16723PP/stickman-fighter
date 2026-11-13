window.ARCADE_STAGE_SETTINGS = [
  {
    "stage": 1,
    "key": "backstreet-awakening",
    "title": "BACKSTREET AWAKENING",
    "location": "Abandoned arcade district",
    "storyIntro": "A street crew has taken over the old arcade district. Find out who is giving the orders.",
    "waves": [
      {
        "wave": 1,
        "title": "ARCADE BLOCKADE",
        "storyBeat": "The crew blocks the street while a knife thrower watches from behind the melee line.",
        "enemyFocus": [
          "thrower",
          "regular",
          "regular"
        ],
        "visualCue": "An arcade sign flashes as the thrower winds up behind the street crew."
      },
      {
        "wave": 2,
        "title": "COIN-RUNNERS",
        "storyBeat": "Fast fighters rush in from both ends of the block.",
        "enemyFocus": [
          "runner",
          "runner",
          "regular"
        ],
        "visualCue": "Neon signs briefly flash as enemies enter from both sides."
      },
      {
        "wave": 3,
        "title": "CAPTAIN'S GUARD",
        "storyBeat": "Bruisers protect the Block Captain and refuse to let you pass.",
        "enemyFocus": [
          "heavy",
          "regular",
          "heavy"
        ],
        "visualCue": "The arcade entrance opens behind the final group."
      }
    ],
    "boss": {
      "name": "BLOCK CAPTAIN",
      "intro": "The captain steps forward, determined to keep the district under crew control.",
      "clear": "The captain drops a crest marked with the docks.",
      "profile": {
        "weapon": "knuckles",
        "reach": 95,
        "scale": 1.25,
        "accessory": [
          "flatCap",
          "vest"
        ],
        "normal1": {
          "key": "bossBlockJab",
          "state": "punch",
          "label": "JAB"
        },
        "normal2": {
          "key": "bossBlockHook",
          "state": "punch",
          "label": "HOOK"
        },
        "signature": {
          "key": "bossBlockParty",
          "label": "BLOCK PARTY",
          "tellBase": 0.72,
          "phase3TellMul": 0.8,
          "tellMin": 0.4
        }
      }
    }
  },
  {
    "stage": 2,
    "key": "dockside-ambush",
    "title": "DOCKSIDE AMBUSH",
    "location": "Industrial harbor",
    "storyIntro": "The crest leads to the harbor, where a shipment is guarded by runners and bruisers.",
    "waves": [
      {
        "wave": 1,
        "title": "PIER WATCH",
        "storyBeat": "Dock guards hold the pier and block the route to the cargo.",
        "enemyFocus": [
          "regular",
          "heavy",
          "regular"
        ],
        "visualCue": "Harbor lights sweep across the dock."
      },
      {
        "wave": 2,
        "title": "HARBOR FLANK",
        "storyBeat": "Runners attack from both sides while the guards hold the center.",
        "enemyFocus": [
          "runner",
          "runner",
          "heavy"
        ],
        "visualCue": "A warning light flashes near the waterline."
      },
      {
        "wave": 3,
        "title": "LEDGER DEFENSE",
        "storyBeat": "Heavies protect the shipment ledger that links the syndicate to the market.",
        "enemyFocus": [
          "heavy",
          "heavy",
          "runner"
        ],
        "visualCue": "The guarded cargo area becomes visible."
      }
    ],
    "boss": {
      "name": "DOCKMASTER",
      "intro": "The Dockmaster arrives to stop you from taking the shipment records.",
      "clear": "The shipment ledger points to the night market.",
      "profile": {
        "weapon": "anchorChain",
        "reach": 230,
        "scale": 1.28,
        "accessory": [
          "peacoat",
          "beanie"
        ],
        "normal1": {
          "key": "bossDockLash",
          "state": "punch",
          "label": "CHAIN LASH"
        },
        "normal2": {
          "key": "bossDockSwing",
          "state": "kick",
          "label": "LOW SWING"
        },
        "signature": {
          "key": "bossDockHaulIn",
          "label": "HAUL IN",
          "tellBase": 0.72,
          "phase3TellMul": 0.8,
          "tellMin": 0.4
        }
      }
    }
  },
  {
    "stage": 3,
    "key": "night-market",
    "title": "NIGHT MARKET",
    "location": "Crowded after-hours market",
    "storyIntro": "Fight through the crowded stalls and recover the syndicate route map.",
    "waves": [
      {
        "wave": 1,
        "title": "STALL GUARDS",
        "storyBeat": "Market crews close in between the stalls.",
        "enemyFocus": [
          "regular",
          "regular",
          "heavy"
        ],
        "visualCue": "Market lanterns and signs flicker as the fight begins."
      },
      {
        "wave": 2,
        "title": "CROWD RUSH",
        "storyBeat": "Runners rush through the market lanes to surround you.",
        "enemyFocus": [
          "runner",
          "runner",
          "regular"
        ],
        "visualCue": "A brief silhouette movement crosses the market background."
      },
      {
        "wave": 3,
        "title": "MAP KEEPERS",
        "storyBeat": "Tough guards protect the route map at the center of the market.",
        "enemyFocus": [
          "tough",
          "heavy",
          "tough"
        ],
        "visualCue": "A lit map board marks the guarded area."
      }
    ],
    "boss": {
      "name": "MARKET KING",
      "intro": "The Market King appears to keep the route map out of your hands.",
      "clear": "The route map leads straight to the ironworks.",
      "profile": {
        "weapon": "cleavers",
        "reach": 100,
        "scale": 1.3,
        "accessory": [
          "apron",
          "lanternCrown"
        ],
        "normal1": {
          "key": "bossMarketChop",
          "state": "punch",
          "label": "CHOP"
        },
        "normal2": {
          "key": "bossMarketCross",
          "state": "punch",
          "label": "CROSS-CHOP"
        },
        "signature": {
          "key": "bossMarketToss",
          "label": "BUTCHER'S TOSS",
          "tellBase": 0.72,
          "phase3TellMul": 0.8,
          "tellMin": 0.4
        }
      }
    }
  },
  {
    "stage": 4,
    "key": "ironworks-break-in",
    "title": "IRONWORKS BREAK-IN",
    "location": "Syndicate weapon foundry",
    "storyIntro": "The foundry is building weapons for the syndicate. Shut down the line and find its foreman.",
    "waves": [
      {
        "wave": 1,
        "title": "FOUNDRY GATE",
        "storyBeat": "Workers turned guards defend the entrance to the weapon line.",
        "enemyFocus": [
          "regular",
          "heavy",
          "regular"
        ],
        "visualCue": "The furnace glow pulses behind the gates."
      },
      {
        "wave": 2,
        "title": "FLOOR PUSH",
        "storyBeat": "Heavy units push forward from the foundry floor.",
        "enemyFocus": [
          "heavy",
          "heavy",
          "runner"
        ],
        "visualCue": "Sparks flare in the foundry background."
      },
      {
        "wave": 3,
        "title": "SHUT DOWN THE LINE",
        "storyBeat": "The last guards protect the controls that keep the weapon line running.",
        "enemyFocus": [
          "tough",
          "heavy",
          "tough"
        ],
        "visualCue": "The machinery lights dim as the wave ends."
      }
    ],
    "boss": {
      "name": "IRON JACK",
      "intro": "The foreman steps in to defend the foundry and its syndicate weapons.",
      "clear": "The foreman reveals a hideout beneath the city.",
      "profile": {
        "weapon": "sledgehammer",
        "reach": 150,
        "scale": 1.35,
        "accessory": [
          "welderMask",
          "glowingApron"
        ],
        "normal1": {
          "key": "bossIronOverhead",
          "state": "kick",
          "label": "OVERHEAD"
        },
        "normal2": {
          "key": "bossIronSweep",
          "state": "punch",
          "label": "SWEEP"
        },
        "signature": {
          "key": "bossForgeQuake",
          "label": "FORGE QUAKE",
          "tellBase": 0.72,
          "phase3TellMul": 0.8,
          "tellMin": 0.4
        }
      }
    }
  },
  {
    "stage": 5,
    "key": "undercity-run",
    "title": "UNDERCITY RUN",
    "location": "Syndicate tunnel network",
    "storyIntro": "The tunnels are crawling with guards. Push through before the syndicate seals the exits.",
    "waves": [
      {
        "wave": 1,
        "title": "TUNNEL PATROL",
        "storyBeat": "Tunnel patrols block the route deeper underground.",
        "enemyFocus": [
          "regular",
          "regular",
          "tough"
        ],
        "visualCue": "Tunnel lights flicker in sequence toward the far exit."
      },
      {
        "wave": 2,
        "title": "SIDE-LANE AMBUSH",
        "storyBeat": "Runners attack from side lanes and try to cut off the route.",
        "enemyFocus": [
          "runner",
          "runner",
          "tough"
        ],
        "visualCue": "A side passage briefly lights up as enemies enter."
      },
      {
        "wave": 3,
        "title": "EXIT SEAL",
        "storyBeat": "Heavies hold the exit while the syndicate tries to seal the tunnel.",
        "enemyFocus": [
          "heavy",
          "heavy",
          "runner"
        ],
        "visualCue": "The exit warning light flashes during the last wave."
      }
    ],
    "boss": {
      "name": "TUNNEL WARDEN",
      "intro": "The Warden arrives to keep the tunnel exit sealed.",
      "clear": "A captured radio gives up the rooftop signal code.",
      "profile": {
        "weapon": "shieldBaton",
        "reach": 110,
        "scale": 1.3,
        "accessory": [
          "helmet",
          "hiVis"
        ],
        "normal1": {
          "key": "bossTunnelBaton",
          "state": "punch",
          "label": "BATON"
        },
        "normal2": {
          "key": "bossTunnelBash",
          "state": "punch",
          "label": "SHIELD BASH"
        },
        "signature": {
          "key": "bossShieldCharge",
          "label": "SHIELD WALL",
          "tellBase": 0.72,
          "phase3TellMul": 0.8,
          "tellMin": 0.4
        }
      }
    }
  },
  {
    "stage": 6,
    "key": "rooftop-signal",
    "title": "ROOFTOP SIGNAL",
    "location": "City rooftops",
    "storyIntro": "Climb above the skyline and trace the signal to its source.",
    "waves": [
      {
        "wave": 1,
        "title": "ROOF ACCESS",
        "storyBeat": "Guards defend the rooftop climb and block the first landing.",
        "enemyFocus": [
          "regular",
          "tough",
          "regular"
        ],
        "visualCue": "A distant antenna blinks above the rooftops."
      },
      {
        "wave": 2,
        "title": "SKYLINE RUNNERS",
        "storyBeat": "Runners pressure the rooftop lanes to keep you from reaching the signal.",
        "enemyFocus": [
          "runner",
          "runner",
          "tough"
        ],
        "visualCue": "The signal light pulses faster."
      },
      {
        "wave": 3,
        "title": "SIGNAL KEEPERS",
        "storyBeat": "Tough guards protect the source of the transmission.",
        "enemyFocus": [
          "tough",
          "heavy",
          "tough"
        ],
        "visualCue": "The antenna flashes as the signal is traced."
      }
    ],
    "boss": {
      "name": "SKYLINE SNIPER",
      "intro": "The signal’s guard appears to stop you from identifying its source.",
      "clear": "The signal names an old martial arts dojo."
    }
  },
  {
    "stage": 7,
    "key": "the-old-dojo",
    "title": "THE OLD DOJO",
    "location": "Traditional martial arts dojo",
    "storyIntro": "The dojo master refuses to let the syndicate pass without a fight.",
    "waves": [
      {
        "wave": 1,
        "title": "FIRST TEST",
        "storyBeat": "The students test your strength before allowing you into the dojo.",
        "enemyFocus": [
          "regular",
          "regular",
          "tough"
        ],
        "visualCue": "Dojo lanterns illuminate the fighting floor."
      },
      {
        "wave": 2,
        "title": "INNER HALL",
        "storyBeat": "A mixed group defends the inner hall and the dojo’s old teachings.",
        "enemyFocus": [
          "runner",
          "tough",
          "heavy"
        ],
        "visualCue": "The inner doors open after the group is defeated."
      },
      {
        "wave": 3,
        "title": "MASTER'S CHALLENGE",
        "storyBeat": "The strongest students prepare the floor for Master Kage.",
        "enemyFocus": [
          "tough",
          "heavy",
          "tough"
        ],
        "visualCue": "The dojo clears behind the final guard."
      }
    ],
    "boss": {
      "name": "MASTER KAGE",
      "intro": "Kage challenges you to prove you can stop the syndicate.",
      "clear": "Kage joins the fight and points to the skybridge."
    }
  },
  {
    "stage": 8,
    "key": "skybridge-showdown",
    "title": "SKYBRIDGE SHOWDOWN",
    "location": "Elevated city bridge",
    "storyIntro": "The syndicate is moving its final operation across the bridge. Stop the convoy.",
    "waves": [
      {
        "wave": 1,
        "title": "CONVOY BLOCKADE",
        "storyBeat": "Convoy guards block the bridge and protect the moving vehicles.",
        "enemyFocus": [
          "heavy",
          "regular",
          "heavy"
        ],
        "visualCue": "Vehicle lights move across the bridge backdrop."
      },
      {
        "wave": 2,
        "title": "BRIDGE FLANK",
        "storyBeat": "Runners attack around the convoy to force you away from the lead vehicle.",
        "enemyFocus": [
          "runner",
          "runner",
          "heavy"
        ],
        "visualCue": "The convoy lights shift forward during the transition."
      },
      {
        "wave": 3,
        "title": "LEAD VEHICLE",
        "storyBeat": "Heavy guards protect the lead vehicle and its invitation to the tower.",
        "enemyFocus": [
          "heavy",
          "tough",
          "heavy"
        ],
        "visualCue": "The lead vehicle stops near the end of the bridge."
      }
    ],
    "boss": {
      "name": "BRIDGE BREAKER",
      "intro": "The convoy’s strongest guard steps forward to protect the operation.",
      "clear": "The convoy carries an invite to the broadcast tower."
    }
  },
  {
    "stage": 9,
    "key": "broadcast-tower",
    "title": "BROADCAST TOWER",
    "location": "Syndicate broadcast center",
    "storyIntro": "Take control of the tower and expose the syndicate leader’s final plan.",
    "waves": [
      {
        "wave": 1,
        "title": "LOWER-FLOOR SECURITY",
        "storyBeat": "Security teams defend the tower’s lower floors.",
        "enemyFocus": [
          "regular",
          "tough",
          "regular"
        ],
        "visualCue": "Broadcast monitors glow through the building."
      },
      {
        "wave": 2,
        "title": "CONTROL ROOM RUSH",
        "storyBeat": "Runners rush toward the control room to stop the broadcast takeover.",
        "enemyFocus": [
          "runner",
          "runner",
          "tough"
        ],
        "visualCue": "Monitor lights flicker as the control room is approached."
      },
      {
        "wave": 3,
        "title": "AIRTIME DEFENSE",
        "storyBeat": "Tough guards protect the broadcast before the signal goes public.",
        "enemyFocus": [
          "tough",
          "heavy",
          "tough"
        ],
        "visualCue": "The broadcast indicator turns on as the final group falls."
      }
    ],
    "boss": {
      "name": "THE DIRECTOR",
      "intro": "The Director moves to stop the message and protect the syndicate’s final plan.",
      "clear": "The leader is waiting at the coliseum. The whole city is watching."
    }
  },
  {
    "stage": 10,
    "key": "coliseum-finale",
    "title": "COLISEUM FINALE",
    "location": "City coliseum",
    "storyIntro": "The syndicate leader has nowhere left to run. End the takeover in front of the city.",
    "waves": [
      {
        "wave": 1,
        "title": "OPENING BOUTS",
        "storyBeat": "Syndicate fighters enter the arena to delay the final confrontation.",
        "enemyFocus": [
          "regular",
          "runner",
          "regular"
        ],
        "visualCue": "Arena lights sweep across the fighting floor."
      },
      {
        "wave": 2,
        "title": "CHAMPION'S GUARD",
        "storyBeat": "Stronger mixed groups build pressure before the chief’s entrance.",
        "enemyFocus": [
          "runner",
          "tough",
          "heavy"
        ],
        "visualCue": "The arena lights focus on the far entrance."
      },
      {
        "wave": 3,
        "title": "FINAL CHALLENGE",
        "storyBeat": "The last guards clear the way to the syndicate chief.",
        "enemyFocus": [
          "heavy",
          "tough",
          "heavy"
        ],
        "visualCue": "The arena goes dark briefly before the chief enters."
      }
    ],
    "boss": {
      "name": "SYNDICATE CHIEF",
      "intro": "The leader enters the arena for the final fight.",
      "clear": "The streets are free again. The arcade district belongs to its people."
    }
  }
];
