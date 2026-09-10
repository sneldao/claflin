export {
  EDUCATION_CATALOG_VERSION,
  listEducationTopics,
  getEducationTopic,
  resolveEducationTopic,
  educationTopicSpokenLine,
  topicIdForHouseTerm,
  isPublishedTopic,
  type EducationTopic,
  type EducationTopicId,
  type EducationContentType,
  type EducationSource,
  type EducationReviewStatus,
} from './catalog';

export {
  getBrokerMethod,
  listBrokerMethods,
  resolveBrokerMethod,
  brokerMethodSpokenLine,
  type BrokerExaminationMethod,
} from './broker-methods';

export {
  DELAYED_TAPE_VERSION,
  DELAYED_TAPE_INTRO,
  DELAYED_TAPE_STEPS,
  DELAYED_TAPE_REVEAL,
  initialDelayedTapeProgress,
  applyDelayedTapeChoice,
  delayedTapeDebrief,
  type DelayedTapeChoice,
  type DelayedTapeProgress,
} from './delayed-tape';

/** Practice return handoff — desk shows a one-time cue, never auto-executes. */
export const PRACTICE_RETURN_PARAM = 'returned';
export const PRACTICE_RETURN_VALUE = 'practice';
export const practiceReturnHref = '/?returned=practice#instruction';
