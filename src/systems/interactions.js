/* global AFRAME Ammo NAF */
import { paths } from "./userinput/paths";
import { SOUND_HOVER_OR_GRAB } from "./sound-effects-system";
import { waitForDOMContentLoaded } from "../utils/async-utils";
import { canMove } from "../utils/permissions-utils";

function findHandCollisionTargetForHand(body) {
  const driver = AFRAME.scenes[0].systems.physics.driver;
  const numManifolds = driver.dispatcher.getNumManifolds();
  const handPtr = Ammo.getPointer(body);
  for (let i = 0; i < numManifolds; i++) {
    const persistentManifold = driver.dispatcher.getManifoldByIndexInternal(i);
    const body0ptr = Ammo.getPointer(persistentManifold.getBody0());
    const body1ptr = Ammo.getPointer(persistentManifold.getBody1());
    if (handPtr !== body0ptr && handPtr !== body1ptr) {
      continue;
    }
    const numContacts = persistentManifold.getNumContacts();
    for (let j = 0; j < numContacts; j++) {
      const manifoldPoint = persistentManifold.getContactPoint(j);
      if (manifoldPoint.getDistance() <= 10e-6) {
        const object3D = driver.els.get(handPtr === body0ptr ? body1ptr : body0ptr).object3D;
        if (object3D.el && object3D.el.components.tags && object3D.el.components.tags.data.isHandCollisionTarget) {
          return object3D.el;
        }
        return null;
      }
    }
  }
  return null;
}

const notRemoteHoverTargets = new Map();
const remoteHoverTargets = new Map();
export function findRemoteHoverTarget(object3D) {
  if (!object3D) return null;
  if (notRemoteHoverTargets.get(object3D)) return null;
  const target = remoteHoverTargets.get(object3D);
  return target || findRemoteHoverTarget(object3D.parent);
}
AFRAME.registerComponent("is-remote-hover-target", {
  init: function() {
    remoteHoverTargets.set(this.el.object3D, this.el);
  },
  remove: function() {
    remoteHoverTargets.delete(this.el.object3D);
  }
});
AFRAME.registerComponent("is-not-remote-hover-target", {
  init: function() {
    notRemoteHoverTargets.set(this.el.object3D, this.el);
  },
  remove: function() {
    notRemoteHoverTargets.delete(this.el.object3D);
  }
});

function isUI(el) {
  return (
    el && el.components.tags && (el.components.tags.data.singleActionButton || el.components.tags.data.holdableButton)
  );
}

AFRAME.registerSystem("interaction", {
  updateCursorIntersection: function(intersection, left) {
    if (!left) {
      this.rightRemoteHoverTarget = intersection && findRemoteHoverTarget(intersection.object);
      return this.rightRemoteHoverTarget;
    }

    this.leftRemoteHoverTarget = intersection && findRemoteHoverTarget(intersection.object);
    return this.leftRemoteHoverTarget;
  },

  isHeld(el) {
    return (
      this.state.leftHand.held === el ||
      this.state.rightHand.held === el ||
      this.state.rightRemote.held === el ||
      this.state.leftRemote.held === el
    );
  },

  release(el) {
    if (this.state.leftHand.held === el) {
      this.state.leftHand.held = null;
    }
    if (this.state.leftHand.hovered === el) {
      this.state.leftHand.hovered = null;
    }
    if (this.state.leftHand.held === el) {
      this.state.leftHand.held = null;
    }
    if (this.state.rightHand.hovered === el) {
      this.state.rightHand.hovered = null;
    }
    if (this.state.rightRemote.held === el) {
      this.state.rightRemote.held = null;
    }
    if (this.state.rightRemote.hovered === el) {
      this.state.rightRemote.hovered = null;
    }
    if (this.state.leftRemote.held === el) {
      this.state.leftRemote.held = null;
    }
    if (this.state.leftRemote.hovered === el) {
      this.state.leftRemote.hovered = null;
    }
  },

  init: function() {
    this.options = {
      leftHand: {
        entity: null,
        grabPath: paths.actions.leftHand.grab,
        dropPath: paths.actions.leftHand.drop,
        hoverFn: findHandCollisionTargetForHand
      },
      rightHand: {
        entity: null,
        grabPath: paths.actions.rightHand.grab,
        dropPath: paths.actions.rightHand.drop,
        hoverFn: findHandCollisionTargetForHand
      },
      rightRemote: {
        entity: null,
        grabPath: paths.actions.cursor.grab,
        dropPath: paths.actions.cursor.drop,
        hoverFn: this.getRightRemoteHoverTarget
      },
      leftRemote: {
        entity: null,
        grabPath: paths.actions.cursor.left.grab,
        dropPath: paths.actions.cursor.left.drop,
        hoverFn: this.getLeftRemoteHoverTarget
      }
    };
    this.state = {
      leftHand: {
        hovered: null,
        held: null,
        spawning: null
      },
      rightHand: {
        hovered: null,
        held: null,
        spawning: null
      },
      rightRemote: {
        hovered: null,
        held: null,
        spawning: null
      },
      leftRemote: {
        hovered: null,
        held: null,
        spawning: null
      }
    };
    this.previousState = {
      leftHand: {
        hovered: null,
        held: null,
        spawning: null
      },
      rightHand: {
        hovered: null,
        held: null,
        spawning: null
      },
      rightRemote: {
        hovered: null,
        held: null,
        spawning: null
      },
      leftRemote: {
        hovered: null,
        held: null,
        spawning: null
      }
    };

    waitForDOMContentLoaded().then(() => {
      this.cursorController = document.getElementById("cursor-controller");
      this.cursorController2 = document.getElementById("cursor-controller2");
      this.options.leftHand.entity = document.getElementById("player-left-controller");
      this.options.rightHand.entity = document.getElementById("player-right-controller");
      this.options.rightRemote.entity = document.getElementById("cursor");
      this.options.leftRemote.entity = document.getElementById("cursor2");
    });
  },

  getRightRemoteHoverTarget() {
    return this.rightRemoteHoverTarget;
  },

  getLeftRemoteHoverTarget() {
    return this.leftRemoteHoverTarget;
  },

  tickInteractor(options, state) {
    const userinput = AFRAME.scenes[0].systems.userinput;
    if (state.held) {
      const networked = state.held.components["networked"];
      const lostOwnership = networked && networked.data && networked.data.owner !== NAF.clientId;
      if (userinput.get(options.dropPath) || lostOwnership) {
        state.held = null;
      }
    } else {
      state.hovered = options.hoverFn.call(this, options.entity.body);
      if (state.hovered) {
        const entity = state.hovered;
        const isHoldable = entity.components.tags && entity.components.tags.data.isHoldable;
        const isFrozen = this.el.is("frozen");
        const isPinned = entity.components.pinnable && entity.components.pinnable.data.pinned;
        if (isHoldable && userinput.get(options.grabPath) && (isFrozen || !isPinned) && canMove(entity)) {
          state.held = entity;
        }
      }
    }
  },

  tick2(sfx) {
    if (!this.el.is("entered")) {
      this.cursorController.components["cursor-controller"].enabled = false;
      this.cursorController2.components["cursor-controller"].enabled = false;
      return;
    }

    Object.assign(this.previousState.rightHand, this.state.rightHand);
    Object.assign(this.previousState.rightRemote, this.state.rightRemote);
    Object.assign(this.previousState.leftHand, this.state.leftHand);
    Object.assign(this.previousState.leftRemote, this.state.leftRemote);

    this.rightHandTeleporter =
      this.rightHandTeleporter || document.querySelector("#player-right-controller").components["teleporter"];
    this.leftHandTeleporter =
      this.leftHandTeleporter || document.querySelector("#player-left-controller").components["teleporter"];
    this.gazeTeleporter = this.gazeTeleporter || document.querySelector("#gaze-teleport").components["teleporter"];

    if (this.options.leftHand.entity.object3D.visible && !this.state.leftRemote.held) {
      this.tickInteractor(this.options.leftHand, this.state.leftHand);
    }
    if (this.options.rightHand.entity.object3D.visible && !this.state.rightRemote.held) {
      this.tickInteractor(this.options.rightHand, this.state.rightHand);
    }
    if (!this.state.rightHand.held && !this.state.rightHand.hovered) {
      this.tickInteractor(this.options.rightRemote, this.state.rightRemote);
    }
    if (!this.state.leftHand.held && !this.state.leftHand.hovered) {
      this.tickInteractor(this.options.leftRemote, this.state.leftRemote);
    }

    const rightHandInteracting = this.state.rightHand.hovered || this.state.rightHand.held;
    const rightHandTeleporting = this.rightHandTeleporter.isTeleporting || this.gazeTeleporter.isTeleporting;
    const rightRemotePenIntersectingInVR =
      this.el.sceneEl.is("vr-mode") &&
      this.state.rightRemote.held &&
      this.state.rightRemote.held.components &&
      this.state.rightRemote.held.components.tags &&
      this.state.rightRemote.held.components.tags.data.isPen &&
      this.state.rightRemote.held.children[0].components.pen.intersection;

    const enableRightRemote = !rightHandInteracting && !rightHandTeleporting && !rightRemotePenIntersectingInVR;

    this.cursorController.components["cursor-controller"].enabled = enableRightRemote;

    if (!enableRightRemote) {
      this.state.rightRemote.hovered = null;
    }

    const leftHandInteracting = this.state.leftHand.hovered || this.state.leftHand.held;
    const leftHandTeleporting = this.leftHandTeleporter.isTeleporting || this.gazeTeleporter.isTeleporting;
    const leftRemotePenIntersectingInVR =
      this.el.sceneEl.is("vr-mode") &&
      this.state.leftRemote.held &&
      this.state.leftRemote.held.components &&
      this.state.leftRemote.held.components.tags &&
      this.state.leftRemote.held.components.tags.data.isPen &&
      this.state.leftRemote.held.children[0].components.pen.intersection;

    const enableLeftRemote = !leftHandInteracting && !leftHandTeleporting && !leftRemotePenIntersectingInVR;

    this.cursorController2.components["cursor-controller"].enabled = enableLeftRemote;

    if (!enableLeftRemote) {
      this.state.leftRemote.hovered = null;
    }

    if (
      this.state.leftHand.held !== this.previousState.leftHand.held ||
      this.state.rightHand.held !== this.previousState.rightHand.held ||
      this.state.rightRemote.held !== this.previousState.rightRemote.held ||
      (isUI(this.state.rightRemote.hovered) &&
        this.state.rightRemote.hovered !== this.previousState.rightRemote.hovered) ||
      this.state.leftRemote.held !== this.previousState.leftRemote.held ||
      (isUI(this.state.leftRemote.hovered) && this.state.leftRemote.hovered !== this.previousState.leftRemote.hovered)
    ) {
      sfx.playSoundOneShot(SOUND_HOVER_OR_GRAB);
    }

    if (this.el.systems.userinput.get(paths.actions.logInteractionState)) {
      console.log(
        "Interaction System State\nleftHand held",
        this.state.leftHand.held,
        "\nleftHand hovered",
        this.state.leftHand.hovered,
        "\nrightHand held",
        this.state.rightHand.held,
        "\nrightHand hovered",
        this.state.rightHand.hovered,
        "\nrightRemote held",
        this.state.rightRemote.held,
        "\nrightRemote hovered",
        this.state.rightRemote.hovered,
        "\nleftRemote held",
        this.state.leftRemote.held,
        "\nleftRemote hovered",
        this.state.leftRemote.hovered
      );
    }
  }
});
