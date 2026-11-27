/** Reversible causes, named exactly as the RCUK 2025 Adult ALS algorithm lists them. */

export const CAUSES = [
  {
    id: "hypoxia",
    name: "Hypoxia",
    short: "Hypoxia",
    identify:
      "Look for an obstructed airway, oxygen that was never connected, a displaced tube, or bronchospasm. The history may be choking, drowning, or respiratory failure. Waveform capnography and the colour of the patient are the bedside clues.",
    treat:
      "Open the airway, give oxygen, and ventilate. Once a tracheal tube or supraglottic airway is in, switch to continuous compressions and use waveform capnography. The algorithm does not specify a device or a volume.",
  },
  {
    id: "hypovolaemia",
    name: "Hypovolaemia",
    short: "Hypovolaemia",
    identify:
      "Think bleeding, sepsis, or profound fluid loss. The history does the work: haematemesis, trauma, a ruptured aneurysm. Ultrasound may show a small, empty heart.",
    treat:
      "Control bleeding and replace volume. The algorithm names hypovolaemia and does not give a fluid dose — follow local policy for blood and fluids.",
  },
  {
    id: "metabolic",
    name: "Hyper-/hypokalaemia, -calcaemia, -magnesaemia, hypoglycaemia",
    short: "Metabolic",
    identify:
      "Take a blood gas and a glucose. A renal history, missed dialysis, or a very wide slow rhythm raises suspicion of potassium. The algorithm groups these metabolic causes together.",
    treat:
      "Treat the abnormality you have found. This trainer does not invent doses for calcium, insulin, magnesium, or glucose — use the dose in your current RCUK manual and local policy.",
  },
  {
    id: "hypothermia",
    name: "Hypo-/hyperthermia",
    short: "Temperature",
    identify:
      "Measure a core temperature. Exposure, immersion, or sepsis may be in the history. Do not guess from how the skin feels.",
    treat:
      "Rewarm or cool as the temperature requires, and keep following the shockable or non-shockable limb while you do. The algorithm card does not change drug timing for temperature.",
  },
  {
    id: "thrombosis-coronary",
    name: "Thrombosis — coronary",
    short: "Coronary",
    identify:
      "Chest pain before the arrest, VF or pulseless VT, and a 12-lead ECG after ROSC. Ultrasound is listed to help identify reversible causes and may show a regional wall-motion abnormality.",
    treat:
      "Consider extracorporeal CPR and/or coronary angiography and PCI, as the algorithm states. Activate the pathway your hospital uses.",
  },
  {
    id: "thrombosis-pulmonary",
    name: "Thrombosis — pulmonary",
    short: "Pulmonary",
    identify:
      "Sudden collapse, especially after surgery or immobility. Ultrasound may show a dilated, strained right ventricle. The algorithm pairs coronary and pulmonary thrombosis.",
    treat:
      "Treat pulmonary thrombosis. The algorithm does not print a drug or a dose — follow local policy for thrombolysis or clot retrieval, and keep the non-shockable or shockable limb going.",
  },
  {
    id: "tension",
    name: "Tension pneumothorax",
    short: "Tension",
    identify:
      "Unequal chest movement, high airway pressures after intubation, or unilateral loss of lung sliding on ultrasound. Trauma and positive-pressure ventilation are the usual settings.",
    treat:
      "Decompress the tension. The algorithm does not choose a technique — use the one you are trained and authorised to perform.",
  },
  {
    id: "toxins",
    name: "Toxins",
    short: "Toxins",
    identify:
      "An empty packet, a witness, or a toxidrome. A very wide QRS can be the electrocardiographic clue. Ask what was taken.",
    treat:
      "Treat the toxin and get expert help. This trainer does not name an antidote or a dose. Those sit in local toxicology guidance, not on the algorithm card.",
  },
  {
    id: "tamponade",
    name: "Tamponade — cardiac",
    short: "Tamponade",
    identify:
      "PEA after cardiac surgery, trauma, or dissection. Drains that have suddenly stopped are a ward clue. Ultrasound shows pericardial fluid.",
    treat:
      "Relieve the tamponade. The algorithm does not describe a procedure — that is a local skill and a local policy.",
  },
];

export function causeById(id) {
  return CAUSES.find((c) => c.id === id);
}
