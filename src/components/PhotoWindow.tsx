import type { Accessor } from "solid-js";
import WindowBase from "./WindowBase";
import type { PanelPlacement } from "../types";

export type PhotoWindowProps = {
  placement: Accessor<PanelPlacement | undefined>;
  bringToFront: () => void;
  onUpdate: (patch: Partial<PanelPlacement>) => void;
  onClose: () => void;
  imageSrc: string;
  zoom: Accessor<number>;
};

export default function PhotoWindow(props: PhotoWindowProps) {
  return (
    <WindowBase
      placement={props.placement}
      onUpdate={props.onUpdate}
      bringToFront={props.bringToFront}
      zoom={props.zoom}
      class="photo-window"
      title="Photo preview"
      subtitle="double click thumbnail to reopen"
      onClose={props.onClose}
      bodyClass="photo-window-body"
    >
      <img src={props.imageSrc} alt="" />
    </WindowBase>
  );
}
