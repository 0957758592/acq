// Shared translations for validation keys.
// Apps can merge these into their i18n resource bundles.

export const validationTranslations = {
  en: {
    validation: {
      required: 'This field is required.',
      email: 'Enter a valid email address.',
      min: 'Must be at least {{min}} characters.',
      url: 'Enter a valid URL.',
      match: 'Values must match.',
      json: 'Enter valid JSON.',
      oneOf: 'Select a valid option.',
      arrayMin: 'Select at least {{min}} item(s).',
      auth: {
        login: {
          email: {
            required: 'Email is required.',
            invalid: 'Enter a valid email address.'
          },
          password: {
            required: 'Password is required.',
            min: 'Password must be at least 6 characters.'
          }
        }
      },
      users: {
        name: {
          required: 'Name is required.'
        },
        email: {
          required: 'Email is required.',
          invalid: 'Enter a valid email address.'
        },
        password: {
          required: 'Password is required.',
          min: 'Password must be at least 6 characters.'
        },
        avatarUrl: {
          invalid: 'Enter a valid URL.'
        },
        role: {
          required: 'Role is required.'
        }
      },
      settings: {
        profile: {
          name: {
            required: 'Name is required.'
          },
          email: {
            required: 'Email is required.',
            invalid: 'Enter a valid email address.'
          },
          avatarUrl: {
            invalid: 'Enter a valid URL.'
          }
        },
        password: {
          currentPassword: {
            required: 'Current password is required.'
          },
          newPassword: {
            required: 'New password is required.',
            min: 'New password must be at least 6 characters.'
          },
          confirmPassword: {
            required: 'Confirm your new password.',
            match: 'Passwords do not match.'
          }
        }
      },
      blog: {
        author: {
          name: {
            required: 'Name is required.'
          },
          slug: {
            required: 'Slug is required.'
          },
          avatarUrl: {
            invalid: 'Enter a valid URL.'
          }
        },
        category: {
          name: {
            required: 'Name is required.'
          },
          slug: {
            required: 'Slug is required.'
          }
        },
        post: {
          title: {
            required: 'Title is required.'
          },
          slug: {
            required: 'Slug is required.'
          },
          status: {
            required: 'Status is required.'
          },
          publishAt: {
            required: 'Publish date is required for scheduled posts.'
          },
          language: {
            required: 'Language is required.'
          },
          coverImageUrl: {
            invalid: 'Enter a valid URL.'
          },
          canonicalUrl: {
            invalid: 'Enter a valid URL.'
          },
          ogImageUrl: {
            invalid: 'Enter a valid URL.'
          },
          twitterImageUrl: {
            invalid: 'Enter a valid URL.'
          },
          structuredDataJson: {
            invalid: 'Enter valid JSON.'
          },
          hreflangUrl: {
            invalid: 'Enter a valid URL.'
          }
        }
      },
      events: {
        event: {
          title: {
            required: 'Title is required.'
          },
          slug: {
            required: 'Slug is required.'
          },
          startAt: {
            required: 'Start time is required.'
          },
          endAt: {
            required: 'End time is required.'
          },
          status: {
            required: 'Status is required.'
          },
          publishAt: {
            required: 'Publish date is required for scheduled events.'
          }
        }
      },
      contact: {
        inquiry: {
          name: {
            required: 'Name is required.'
          },
          email: {
            required: 'Email is required.',
            invalid: 'Enter a valid email address.'
          },
          subject: {
            required: 'Subject is required.'
          },
          message: {
            required: 'Message is required.'
          },
          status: {
            required: 'Status is required.'
          }
        }
      },
      seo: {
        siteName: {
          required: 'Site name is required.'
        },
        defaultTitle: {
          required: 'Default title is required.'
        },
        defaultDescription: {
          required: 'Default description is required.'
        },
        defaultCanonicalBase: {
          invalid: 'Enter a valid URL.'
        },
        defaultOgImageUrl: {
          invalid: 'Enter a valid URL.'
        },
        defaultTwitterImageUrl: {
          invalid: 'Enter a valid URL.'
        },
        structuredDataJson: {
          invalid: 'Enter valid JSON.'
        },
        hreflangLocales: {
          min: 'Enter at least one locale.'
        },
        defaultLocale: {
          required: 'Select a default locale.',
          oneOf: 'Default locale must be one of the configured locales.'
        },
        routeOverride: {
          routeKey: {
            required: 'Route key is required.'
          },
          canonicalUrl: {
            invalid: 'Enter a valid URL.'
          },
          ogImageUrl: {
            invalid: 'Enter a valid URL.'
          },
          twitterImageUrl: {
            invalid: 'Enter a valid URL.'
          },
          structuredDataJson: {
            invalid: 'Enter valid JSON.'
          },
          hreflangUrl: {
            invalid: 'Enter a valid URL.'
          }
        }
      },
      booking: {
        service: {
          name: {
            required: 'Service name is required.'
          },
          slug: {
            required: 'Service slug is required.'
          }
        },
        availability: {
          serviceId: {
            required: 'Service is required.'
          },
          date: {
            required: 'Date is required.'
          },
          dayOfWeek: {
            required: 'Day of week is required.'
          },
          startMinutes: {
            required: 'Start time is required.'
          },
          endMinutes: {
            required: 'End time is required.'
          }
        },
        booking: {
          serviceId: {
            required: 'Service is required.'
          },
          startAt: {
            required: 'Start time is required.'
          },
          endAt: {
            required: 'End time is required.'
          },
          customerName: {
            required: 'Name is required.'
          },
          customerEmail: {
            required: 'Email is required.',
            invalid: 'Enter a valid email address.'
          }
        }
      },
      payments: {
        checkout: {
          mode: {
            required: 'Checkout mode is required.'
          },
          successUrl: {
            required: 'Success URL is required.'
          },
          cancelUrl: {
            required: 'Cancel URL is required.'
          },
          customerEmail: {
            invalid: 'Enter a valid email address.'
          },
          lineItemName: {
            required: 'Line item name is required.'
          },
          lineItemAmount: {
            required: 'Line item amount is required.'
          },
          lineItemCurrency: {
            required: 'Line item currency is required.'
          }
        },
        intent: {
          amount: {
            required: 'Amount is required.'
          },
          currency: {
            required: 'Currency is required.'
          }
        },
        subscription: {
          customerId: {
            required: 'Customer ID is required.'
          },
          priceId: {
            required: 'Price ID is required.'
          }
        }
      }
  },
  es: {
    validation: {
      required: 'Este campo es obligatorio.',
      email: 'Introduce un email válido.',
      min: 'Debe tener al menos {{min}} caracteres.',
      url: 'Introduce una URL válida.',
      match: 'Los valores deben coincidir.',
      json: 'Introduce un JSON válido.',
      oneOf: 'Selecciona una opción válida.',
      arrayMin: 'Selecciona al menos {{min}} elemento(s).',
      auth: {
        login: {
          email: {
            required: 'El email es obligatorio.',
            invalid: 'Introduce un email válido.'
          },
          password: {
            required: 'La contraseña es obligatoria.',
            min: 'La contraseña debe tener al menos 6 caracteres.'
          }
        }
      },
      users: {
        name: {
          required: 'El nombre es obligatorio.'
        },
        email: {
          required: 'El email es obligatorio.',
          invalid: 'Introduce un email válido.'
        },
        password: {
          required: 'La contraseña es obligatoria.',
          min: 'La contraseña debe tener al menos 6 caracteres.'
        },
        role: {
          required: 'El rol es obligatorio.'
        }
      },
      settings: {
        profile: {
          name: {
            required: 'El nombre es obligatorio.'
          },
          email: {
            required: 'El email es obligatorio.',
            invalid: 'Introduce un email válido.'
          }
        },
        password: {
          currentPassword: {
            required: 'La contraseña actual es obligatoria.'
          },
          newPassword: {
            required: 'La nueva contraseña es obligatoria.',
            min: 'La nueva contraseña debe tener al menos 6 caracteres.'
          },
          confirmPassword: {
            required: 'Confirma tu nueva contraseña.',
            match: 'Las contraseñas no coinciden.'
          }
        }
      },
      blog: {
        author: {
          name: {
            required: 'El nombre es obligatorio.'
          },
          slug: {
            required: 'El slug es obligatorio.'
          },
          avatarUrl: {
            invalid: 'Introduce una URL válida.'
          }
        },
        category: {
          name: {
            required: 'El nombre es obligatorio.'
          },
          slug: {
            required: 'El slug es obligatorio.'
          }
        },
        post: {
          title: {
            required: 'El título es obligatorio.'
          },
          slug: {
            required: 'El slug es obligatorio.'
          },
          status: {
            required: 'El estado es obligatorio.'
          },
          publishAt: {
            required: 'La fecha de publicación es obligatoria para programar.'
          },
          language: {
            required: 'El idioma es obligatorio.'
          },
          coverImageUrl: {
            invalid: 'Introduce una URL válida.'
          },
          canonicalUrl: {
            invalid: 'Introduce una URL válida.'
          },
          ogImageUrl: {
            invalid: 'Introduce una URL válida.'
          },
          twitterImageUrl: {
            invalid: 'Introduce una URL válida.'
          },
          structuredDataJson: {
            invalid: 'Introduce un JSON válido.'
          },
          hreflangUrl: {
            invalid: 'Introduce una URL válida.'
          }
        }
      },
      events: {
        event: {
          title: {
            required: 'El título es obligatorio.'
          },
          slug: {
            required: 'El slug es obligatorio.'
          },
          startAt: {
            required: 'La hora de inicio es obligatoria.'
          },
          endAt: {
            required: 'La hora de fin es obligatoria.'
          },
          status: {
            required: 'El estado es obligatorio.'
          },
          publishAt: {
            required: 'La fecha de publicación es obligatoria para programar.'
          }
        }
      },
      contact: {
        inquiry: {
          name: {
            required: 'El nombre es obligatorio.'
          },
          email: {
            required: 'El email es obligatorio.',
            invalid: 'Introduce un email válido.'
          },
          subject: {
            required: 'El asunto es obligatorio.'
          },
          message: {
            required: 'El mensaje es obligatorio.'
          },
          status: {
            required: 'El estado es obligatorio.'
          }
        }
      },
      seo: {
        siteName: {
          required: 'El nombre del sitio es obligatorio.'
        },
        defaultTitle: {
          required: 'El título por defecto es obligatorio.'
        },
        defaultDescription: {
          required: 'La descripción por defecto es obligatoria.'
        },
        defaultCanonicalBase: {
          invalid: 'Introduce una URL válida.'
        },
        defaultOgImageUrl: {
          invalid: 'Introduce una URL válida.'
        },
        defaultTwitterImageUrl: {
          invalid: 'Introduce una URL válida.'
        },
        structuredDataJson: {
          invalid: 'Introduce un JSON válido.'
        },
        hreflangLocales: {
          min: 'Introduce al menos un idioma.'
        },
        defaultLocale: {
          required: 'Selecciona un idioma por defecto.',
          oneOf: 'El idioma por defecto debe estar en la lista.'
        },
        routeOverride: {
          routeKey: {
            required: 'La clave de ruta es obligatoria.'
          },
          canonicalUrl: {
            invalid: 'Introduce una URL válida.'
          },
          ogImageUrl: {
            invalid: 'Introduce una URL válida.'
          },
          twitterImageUrl: {
            invalid: 'Introduce una URL válida.'
          },
          structuredDataJson: {
            invalid: 'Introduce un JSON válido.'
          },
          hreflangUrl: {
            invalid: 'Introduce una URL válida.'
          }
        }
      },
      booking: {
        service: {
          name: {
            required: 'El nombre del servicio es obligatorio.'
          },
          slug: {
            required: 'El slug del servicio es obligatorio.'
          }
        },
        availability: {
          serviceId: {
            required: 'El servicio es obligatorio.'
          },
          date: {
            required: 'La fecha es obligatoria.'
          },
          dayOfWeek: {
            required: 'El día de la semana es obligatorio.'
          },
          startMinutes: {
            required: 'La hora de inicio es obligatoria.'
          },
          endMinutes: {
            required: 'La hora de fin es obligatoria.'
          }
        },
        booking: {
          serviceId: {
            required: 'El servicio es obligatorio.'
          },
          startAt: {
            required: 'La hora de inicio es obligatoria.'
          },
          endAt: {
            required: 'La hora de fin es obligatoria.'
          },
          customerName: {
            required: 'El nombre es obligatorio.'
          },
          customerEmail: {
            required: 'El email es obligatorio.',
            invalid: 'Introduce un email válido.'
          }
        }
      },
      payments: {
        checkout: {
          mode: {
            required: 'El modo de pago es obligatorio.'
          },
          successUrl: {
            required: 'La URL de éxito es obligatoria.'
          },
          cancelUrl: {
            required: 'La URL de cancelación es obligatoria.'
          },
          customerEmail: {
            invalid: 'Introduce un email válido.'
          },
          lineItemName: {
            required: 'El nombre del producto es obligatorio.'
          },
          lineItemAmount: {
            required: 'El monto del producto es obligatorio.'
          },
          lineItemCurrency: {
            required: 'La moneda del producto es obligatoria.'
          }
        },
        intent: {
          amount: {
            required: 'El monto es obligatorio.'
          },
          currency: {
            required: 'La moneda es obligatoria.'
          }
        },
        subscription: {
          customerId: {
            required: 'El ID del cliente es obligatorio.'
          },
          priceId: {
            required: 'El ID del precio es obligatorio.'
          }
        }
      }
      }
    }
  }
};




