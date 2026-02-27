import validator from 'validator';


        function processEmail(email: string) {
          try {
            const result = validator.normalizeEmail(email);
            if (!result) {
              throw new Error('Invalid');
            }

            const another = doSomethingElse();
            if (!another) {
              throw new Error('Also invalid');
            }

            return result + another;
          } catch (error) {
            console.error(error);
            throw error;
          }
        }
      