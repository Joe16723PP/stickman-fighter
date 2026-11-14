/* Stage settings for Beat 'em up.
   Per wave: "enemyFocus" lists the enemies in spawn order (archetype keys).
   Optional spawn spots (per enemy, aligned with enemyFocus by index):
     wave  "spawns":       [{ "ox": 0-1, "depth": 0-1 }, ...]
     stage "spawnLayouts": { "default": [...], "1": [...], "2": [...], "3": [...] }  (same entry shape)
   ox = entry point across the locked screen (0 left .. 1 right), depth = lane (0 back .. 1 front). Values are clamped to 0-1.
   Each field falls back per enemy: wave spawns -> stage spawnLayouts[wave] -> stage spawnLayouts.default -> built-in
   layout (BeatEmUp.SPAWN_LAYOUTS). Spawning still keeps enemies in the revealed area (x >= .42 screen, .12 on Wave 2).
   Difficulty extras and reinforcements are derived from these spots as before. */
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
        "title": "BRAWLER BLOCKADE",
        "storyBeat": "Two crew brawlers block the arcade street and trade jab-cross strings as they close in.",
        "enemyFocus": [
          "brawler",
          "brawler"
        ],
        "spawns": [
          {
            "ox": 0.58,
            "depth": 0.25
          },
          {
            "ox": 0.78,
            "depth": 0.75
          }
        ],
        "visualCue": "An arcade sign flickers as two brawlers square up across the street."
      },
      {
        "wave": 2,
        "title": "COIN-RUSH",
        "storyBeat": "A rusher crouches at the far end of the block while two brawlers keep you busy.",
        "enemyFocus": [
          "brawler",
          "rusher",
          "brawler"
        ],
        "spawns": [
          {
            "ox": 0.3,
            "depth": 0.3
          },
          {
            "ox": 0.86,
            "depth": 0.55
          },
          {
            "ox": 0.62,
            "depth": 0.82
          }
        ],
        "visualCue": "Neon signs flash as the rusher drops into a crouch before charging."
      },
      {
        "wave": 3,
        "title": "CAPTAIN'S CREW",
        "storyBeat": "Brawlers hold the line while rushers charge from the back to protect the Block Captain.",
        "enemyFocus": [
          "brawler",
          "rusher",
          "brawler",
          "rusher"
        ],
        "spawns": [
          {
            "ox": 0.5,
            "depth": 0.22
          },
          {
            "ox": 0.86,
            "depth": 0.5
          },
          {
            "ox": 0.64,
            "depth": 0.84
          },
          {
            "ox": 0.93,
            "depth": 0.12
          }
        ],
        "visualCue": "The arcade entrance opens behind the final crew."
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
    "storyIntro": "The crest leads to the harbor, where grapplers and brawlers guard a syndicate shipment.",
    "waves": [
      {
        "wave": 1,
        "title": "PIER WATCH",
        "storyBeat": "A dock grappler waits on the pier to grab anyone who gets too close, while a brawler hangs back by the cargo.",
        "enemyFocus": [
          "grappler",
          "brawler"
        ],
        "spawns": [
          {
            "ox": 0.55,
            "depth": 0.5
          },
          {
            "ox": 0.92,
            "depth": 0.15
          }
        ],
        "visualCue": "Harbor lights sweep the pier as the grappler opens its arms."
      },
      {
        "wave": 2,
        "title": "HARBOR FLANK",
        "storyBeat": "Brawlers close in from both sides to push you into the grappler's reach.",
        "enemyFocus": [
          "grappler",
          "brawler",
          "brawler"
        ],
        "spawns": [
          {
            "ox": 0.6,
            "depth": 0.5
          },
          {
            "ox": 0.3,
            "depth": 0.2
          },
          {
            "ox": 0.85,
            "depth": 0.82
          }
        ],
        "visualCue": "A warning light flashes near the waterline as the brawlers fan out."
      },
      {
        "wave": 3,
        "title": "LEDGER DEFENSE",
        "storyBeat": "Two grapplers hold separate lanes while brawlers guard the shipment ledger.",
        "enemyFocus": [
          "grappler",
          "grappler",
          "brawler",
          "brawler"
        ],
        "spawns": [
          {
            "ox": 0.55,
            "depth": 0.3
          },
          {
            "ox": 0.88,
            "depth": 0.8
          },
          {
            "ox": 0.7,
            "depth": 0.6
          },
          {
            "ox": 0.95,
            "depth": 0.12
          }
        ],
        "visualCue": "The guarded cargo area opens up between the two grapplers."
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
          "brawler",
          "regular",
          "heavy"
        ],
        "visualCue": "Market lanterns and signs flicker as the fight begins."
      },
      {
        "wave": 2,
        "title": "CROWD RUSH",
        "storyBeat": "Rushers charge through the market lanes to surround you.",
        "enemyFocus": [
          "rusher",
          "rusher",
          "regular"
        ],
        "visualCue": "A brief silhouette movement crosses the market background."
      },
      {
        "wave": 3,
        "title": "MAP KEEPERS",
        "storyBeat": "Shield guards protect the route map at the center of the market.",
        "enemyFocus": [
          "guard",
          "heavy",
          "guard"
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
          "rusher"
        ],
        "visualCue": "Sparks flare in the foundry background."
      },
      {
        "wave": 3,
        "title": "SHUT DOWN THE LINE",
        "storyBeat": "The last guards protect the controls that keep the weapon line running.",
        "enemyFocus": [
          "guard",
          "heavy",
          "guard"
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
          "guard"
        ],
        "visualCue": "Tunnel lights flicker in sequence toward the far exit."
      },
      {
        "wave": 2,
        "title": "SIDE-LANE AMBUSH",
        "storyBeat": "Rushers attack from side lanes and try to cut off the route.",
        "enemyFocus": [
          "rusher",
          "rusher",
          "guard"
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
          "rusher"
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
          "guard",
          "regular"
        ],
        "visualCue": "A distant antenna blinks above the rooftops."
      },
      {
        "wave": 2,
        "title": "SKYLINE RUNNERS",
        "storyBeat": "Rushers pressure the rooftop lanes to keep you from reaching the signal.",
        "enemyFocus": [
          "rusher",
          "rusher",
          "guard"
        ],
        "visualCue": "The signal light pulses faster."
      },
      {
        "wave": 3,
        "title": "SIGNAL KEEPERS",
        "storyBeat": "Shield guards protect the source of the transmission.",
        "enemyFocus": [
          "guard",
          "heavy",
          "guard"
        ],
        "visualCue": "The antenna flashes as the signal is traced."
      }
    ],
    "boss": {
      "name": "SKYLINE SNIPER",
      "intro": "The signal’s guard appears to stop you from identifying its source.",
      "clear": "The signal names an old martial arts dojo.",
      "profile": {
        "weapon": "crossbow",
        "reach": 100,
        "scale": 1.25,
        "accessory": [
          "hood",
          "redVisor"
        ],
        "normal1": {
          "key": "bossSniperStock",
          "state": "punch",
          "label": "STOCK STRIKE"
        },
        "normal2": {
          "key": "bossSniperKick",
          "state": "kick",
          "label": "KICK"
        },
        "signature": {
          "key": "bossLaserLock",
          "label": "LASER LOCK",
          "tellBase": 0.72,
          "phase3TellMul": 0.8,
          "tellMin": 0.4
        }
      }
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
          "guard"
        ],
        "visualCue": "Dojo lanterns illuminate the fighting floor."
      },
      {
        "wave": 2,
        "title": "INNER HALL",
        "storyBeat": "A mixed group defends the inner hall and the dojo’s old teachings.",
        "enemyFocus": [
          "rusher",
          "guard",
          "heavy"
        ],
        "visualCue": "The inner doors open after the group is defeated."
      },
      {
        "wave": 3,
        "title": "MASTER'S CHALLENGE",
        "storyBeat": "The strongest students prepare the floor for Master Kage.",
        "enemyFocus": [
          "guard",
          "heavy",
          "guard"
        ],
        "visualCue": "The dojo clears behind the final guard."
      }
    ],
    "boss": {
      "name": "MASTER KAGE",
      "intro": "Kage challenges you to prove you can stop the syndicate.",
      "clear": "Kage joins the fight and points to the skybridge.",
      "profile": {
        "weapon": "naginata",
        "reach": 200,
        "scale": 1.28,
        "accessory": [
          "gi",
          "hakama",
          "longHair"
        ],
        "normal1": {
          "key": "bossKageThrust",
          "state": "punch",
          "label": "THRUST"
        },
        "normal2": {
          "key": "bossKageWheel",
          "state": "kick",
          "label": "WHEEL CUT"
        },
        "signature": {
          "key": "bossShadowStep",
          "label": "SHADOW STEP",
          "tellBase": 0.72,
          "phase3TellMul": 0.8,
          "tellMin": 0.4
        },
        "counter": "kage"
      }
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
        "storyBeat": "Rushers attack around the convoy to force you away from the lead vehicle.",
        "enemyFocus": [
          "rusher",
          "rusher",
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
          "guard",
          "heavy"
        ],
        "visualCue": "The lead vehicle stops near the end of the bridge."
      }
    ],
    "boss": {
      "name": "BRIDGE BREAKER",
      "intro": "The convoy’s strongest guard steps forward to protect the operation.",
      "clear": "The convoy carries an invite to the broadcast tower.",
      "profile": {
        "weapon": "girder",
        "reach": 210,
        "scale": 1.4,
        "accessory": [
          "hardHat"
        ],
        "normal1": {
          "key": "bossBreakerSwing",
          "state": "punch",
          "label": "GIRDER SWING"
        },
        "normal2": {
          "key": "bossBreakerShove",
          "state": "kick",
          "label": "SHOVE"
        },
        "signature": {
          "key": "bossRoadblock",
          "label": "ROADBLOCK",
          "tellBase": 0.72,
          "phase3TellMul": 0.8,
          "tellMin": 0.4
        },
        "speedMul": 0.7
      }
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
          "guard",
          "regular"
        ],
        "visualCue": "Broadcast monitors glow through the building."
      },
      {
        "wave": 2,
        "title": "CONTROL ROOM RUSH",
        "storyBeat": "Rushers charge toward the control room to stop the broadcast takeover.",
        "enemyFocus": [
          "rusher",
          "rusher",
          "guard"
        ],
        "visualCue": "Monitor lights flicker as the control room is approached."
      },
      {
        "wave": 3,
        "title": "AIRTIME DEFENSE",
        "storyBeat": "Shield guards protect the broadcast before the signal goes public.",
        "enemyFocus": [
          "guard",
          "heavy",
          "guard"
        ],
        "visualCue": "The broadcast indicator turns on as the final group falls."
      }
    ],
    "boss": {
      "name": "THE DIRECTOR",
      "intro": "The Director moves to stop the message and protect the syndicate’s final plan.",
      "clear": "The leader is waiting at the coliseum. The whole city is watching.",
      "profile": {
        "weapon": "shockBaton",
        "reach": 115,
        "scale": 1.3,
        "accessory": [
          "suit",
          "headset"
        ],
        "normal1": {
          "key": "bossDirectorJab",
          "state": "punch",
          "label": "SHOCK JAB"
        },
        "normal2": {
          "key": "bossDirectorSweep",
          "state": "kick",
          "label": "BATON SWEEP"
        },
        "signature": {
          "key": "bossLiveBroadcast",
          "label": "LIVE BROADCAST",
          "tellBase": 0.72,
          "phase3TellMul": 0.8,
          "tellMin": 0.5
        }
      }
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
          "rusher",
          "regular"
        ],
        "visualCue": "Arena lights sweep across the fighting floor."
      },
      {
        "wave": 2,
        "title": "CHAMPION'S GUARD",
        "storyBeat": "Stronger mixed groups build pressure before the chief’s entrance.",
        "enemyFocus": [
          "rusher",
          "guard",
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
          "guard",
          "heavy"
        ],
        "visualCue": "The arena goes dark briefly before the chief enters."
      }
    ],
    "boss": {
      "name": "SYNDICATE CHIEF",
      "intro": "The leader enters the arena for the final fight.",
      "clear": "The streets are free again. The arcade district belongs to its people.",
      "profile": {
        "weapon": "twinBlades",
        "reach": 110,
        "scale": 1.35,
        "accessory": [
          "suit",
          "goldCrown"
        ],
        "normal1": {
          "key": "bossChiefSlash",
          "state": "punch",
          "label": "TWIN SLASH"
        },
        "normal2": {
          "key": "bossChiefCross",
          "state": "kick",
          "label": "CROSS CUT"
        },
        "phases": {
          "1": {
            "weapon": "twinBlades",
            "reach": 110,
            "normal1": {
              "key": "bossChiefSlash",
              "state": "punch",
              "label": "TWIN SLASH"
            },
            "normal2": {
              "key": "bossChiefCross",
              "state": "kick",
              "label": "CROSS CUT"
            }
          },
          "2": {
            "weapon": "sledgehammer",
            "reach": 150,
            "normal1": {
              "key": "bossChiefSmash",
              "state": "punch",
              "label": "HAMMER SMASH"
            },
            "normal2": {
              "key": "bossChiefSweep",
              "state": "kick",
              "label": "HAMMER SWEEP"
            }
          },
          "3": {
            "weapon": "gauntlets",
            "reach": 90,
            "normal1": {
              "key": "bossChiefJab",
              "state": "punch",
              "label": "IRON JAB"
            },
            "normal2": {
              "key": "bossChiefHook",
              "state": "kick",
              "label": "IRON HOOK"
            }
          }
        },
        "replay": {
          "picks": 3,
          "from": 9
        },
        "signature": {
          "key": "bossColiseumFinale",
          "label": "COLISEUM FINALE",
          "tellBase": 0.72,
          "phase3TellMul": 0.8,
          "tellMin": 0.5
        }
      }
    }
  }
];
