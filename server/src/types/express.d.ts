declare global {
  namespace Express {
    interface Request {
      staffUser?: {
        id: number;
        fullName: string;
        email: string;
      };
    }
  }
}

export {};
