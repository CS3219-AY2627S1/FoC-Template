// Original file: proto/credit.proto


export interface Balance {
  'userId'?: (string);
  'availableCredits'?: (number);
  'reservedCredits'?: (number);
  'totalCredits'?: (number);
}

export interface Balance__Output {
  'userId': (string);
  'availableCredits': (number);
  'reservedCredits': (number);
  'totalCredits': (number);
}
